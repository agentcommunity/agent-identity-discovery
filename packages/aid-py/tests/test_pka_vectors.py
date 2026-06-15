# MIT License
# Shared PKA vectors parity tests (Python)

import sys, pathlib, json, base64, time, re
import pytest

sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

from aid_py import discover, AidError  # noqa: E402

cryptography = pytest.importorskip("cryptography")
from cryptography.hazmat.primitives.asymmetric import ed25519  # type: ignore # noqa: E402
from cryptography.hazmat.primitives import serialization  # type: ignore # noqa: E402


def _load_vectors():
    root = pathlib.Path(__file__).resolve().parents[3]
    data = json.loads((root / "protocol" / "pka_vectors.json").read_text())
    return data["vectors"]


def _load_v1_vectors():
    return [vector for vector in _load_vectors() if vector["record"]["v"] == "aid1"]


def _vector_by_id(vector_id: str):
    for vector in _load_vectors():
        if vector["id"] == vector_id:
            return vector
    raise AssertionError(f"missing vector: {vector_id}")


ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def _b58encode(b: bytes) -> str:
    n = int.from_bytes(b, "big")
    out = ""
    while n > 0:
        n, rem = divmod(n, 58)
        out = ALPHABET[rem] + out
    pad = 0
    for x in b:
        if x == 0:
            pad += 1
        else:
            break
    return "1" * pad + out


class _Resp:
    def __init__(self, status: int, headers: dict[str, str], body: str):
        self.status = status
        self.headers = headers
        self._b = body.encode()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return self._b


@pytest.mark.parametrize("vector", _load_v1_vectors(), ids=lambda v: v["id"])  # type: ignore
def test_pka_vectors(monkeypatch, vector):
    import dns.resolver

    def _no_record(name, rdtype, lifetime=5.0):
        raise dns.resolver.NXDOMAIN()

    monkeypatch.setattr(dns.resolver, "resolve", _no_record)

    seed = base64.b64decode(vector["key"]["seed_b64"])  # 32 bytes
    priv = ed25519.Ed25519PrivateKey.from_private_bytes(seed)
    pub = priv.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    pka = "z" + _b58encode(pub)

    import urllib.request

    def _fake_open(req, timeout=2.0):
        url = req.full_url if hasattr(req, "full_url") else req
        if url.endswith("/.well-known/agent"):
            headers = {"Content-Type": "application/json"}
            body = json.dumps({
                "v": vector["record"]["v"],
                "u": vector["record"]["u"],
                "p": vector["record"]["p"],
                "k": pka,
                "i": vector["record"]["i"],
            })
            return _Resp(200, headers, body)
        order = vector["covered"]
        def _h(name: str):
            v = None
            try:
                v = req.headers.get(name) if hasattr(req, "headers") else None
            except Exception:
                v = None
            if not v and hasattr(req, "get_header"):
                try:
                    v = req.get_header(name)
                except Exception:
                    v = None
            if not v and hasattr(req, "headers") and isinstance(req.headers, dict):
                for k, val in req.headers.items():
                    if k.lower() == name.lower():
                        v = val
                        break
            return v
        challenge = _h("AID-Challenge")
        method = "GET"
        target = url
        from urllib.parse import urlparse

        host = urlparse(url).netloc
        # For pass cases, echo back the client's Date header; otherwise use the vector-provided httpDate
        date = _h("Date") if vector["expect"] == "pass" else (vector.get("httpDate") or _h("Date"))
        lines: list[str] = []
        for item in order:
            if item == "AID-Challenge":
                lines.append(f'"AID-Challenge": {challenge}')
            elif item == "@method":
                lines.append(f'"@method": {method}')
            elif item == "@target-uri":
                lines.append(f'"@target-uri": {target}')
            elif item == "host":
                lines.append(f'"host": {host}')
            elif item == "date":
                lines.append(f'"date": {date}')
        keyid = vector.get("overrideKeyId") or vector["record"]["i"]
        alg = vector.get("overrideAlg") or "ed25519"
        created = int(time.time()) if vector["expect"] == "pass" else vector["created"]
        quoted = ' '.join([f'"{c}"' for c in order])
        params = f"({quoted});created={created};keyid={keyid};alg=\"{alg}\""
        lines.append(f'"@signature-params": {params}')
        base = "\n".join(lines).encode("utf-8")
        sig = priv.sign(base)
        headers = {
            "Signature-Input": f"sig=({quoted});created={created};keyid={keyid};alg=\"{alg}\"",
            "Signature": f"sig=:{base64.b64encode(sig).decode()}:",
            "Date": date,
        }
        return _Resp(200, headers, "")

    class _FakeOpener:
        def open(self, req, timeout=2.0):
            return _fake_open(req, timeout)

    monkeypatch.setattr(urllib.request, "build_opener", lambda *args, **kwargs: _FakeOpener())

    if vector["expect"] == "pass":
        rec, _ = discover("example.com", well_known_fallback=True)
        assert rec["pka"].startswith("z")
    else:
        with pytest.raises(AidError):
            discover("example.com", well_known_fallback=True)


def _header(req, name: str):
    try:
        value = req.headers.get(name) if hasattr(req, "headers") else None
    except Exception:
        value = None
    if not value and hasattr(req, "get_header"):
        try:
            value = req.get_header(name)
        except Exception:
            value = None
    if not value and hasattr(req, "headers") and isinstance(req.headers, dict):
        for key, candidate in req.headers.items():
            if key.lower() == name.lower():
                value = candidate
                break
    return value


def _b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def test_v2_pka_accepts_canonical_rfc9421_signed_401(monkeypatch):
    import dns.resolver
    import urllib.request
    import aid_py.pka as pka_module

    vector = _vector_by_id("v2-rfc9421-response-signature")

    # Derive keyid from the vector's response signature_input rather than hardcoding.
    keyid_match = re.search(r'keyid="([^"]+)"', vector["response"]["signature_input"])
    assert keyid_match is not None, "keyid not found in vector response signature_input"
    keyid = keyid_match.group(1)

    def _no_record(name, rdtype, lifetime=5.0):
        raise dns.resolver.NXDOMAIN()

    monkeypatch.setattr(dns.resolver, "resolve", _no_record)
    monkeypatch.setattr(pka_module.os, "urandom", lambda n: _b64url_decode(vector["nonce"]))
    monkeypatch.setattr(pka_module.time, "time", lambda: vector["created"] + 30)

    def _fake_open(req, timeout=2.0):
        url = req.full_url if hasattr(req, "full_url") else req
        if url.endswith("/.well-known/agent"):
            return _Resp(200, {"Content-Type": "application/json"}, json.dumps(vector["record"]))
        assert url == vector["request"]["target_uri"]
        assert _header(req, "Cache-Control") == vector["request"]["cache_control"]
        # discover() always sends domain_alabel, so the client uses the db form.
        expected_accept_sig = pka_module._build_accept_signature_v2(keyid, vector["nonce"], domain_bound=True)
        assert _header(req, "Accept-Signature") == expected_accept_sig
        # AID-Domain must be the canonicalized queried host.
        assert _header(req, "AID-Domain") == "example.com"
        return _Resp(
            401,
            {
                "Cache-Control": vector["response"]["cache_control"],
                "Signature-Input": vector["response"]["signature_input"],
                "Signature": vector["response"]["signature"],
            },
            "",
        )

    class _FakeOpener:
        def open(self, req, timeout=2.0):
            return _fake_open(req, timeout)

    monkeypatch.setattr(urllib.request, "build_opener", lambda *args, **kwargs: _FakeOpener())

    rec, _ = discover("example.com", well_known_fallback=True)
    assert rec["v"] == "aid2"
    assert rec["pka"] == vector["record"]["k"]
    # The server replied with aid-pka-v2 (unbound); dual-tag acceptance → domain_bound False.
    assert rec.get("domain_bound") is False


def test_v2_pka_canonicalizes_uppercase_host_default_port_and_fragment(monkeypatch):
    import dns.resolver
    import urllib.request
    import aid_py.pka as pka_module

    vector = _vector_by_id("v2-uppercase-host-default-port-canonical-target")

    # Derive keyid from the vector's response signature_input rather than hardcoding.
    keyid_match = re.search(r'keyid="([^"]+)"', vector["response"]["signature_input"])
    assert keyid_match is not None, "keyid not found in vector response signature_input"
    keyid = keyid_match.group(1)

    def _no_record(name, rdtype, lifetime=5.0):
        raise dns.resolver.NXDOMAIN()

    monkeypatch.setattr(dns.resolver, "resolve", _no_record)
    monkeypatch.setattr(pka_module.os, "urandom", lambda n: _b64url_decode(vector["nonce"]))
    monkeypatch.setattr(pka_module.time, "time", lambda: vector["created"] + 30)

    def _fake_open(req, timeout=2.0):
        url = req.full_url if hasattr(req, "full_url") else req
        if url.endswith("/.well-known/agent"):
            return _Resp(200, {"Content-Type": "application/json"}, json.dumps(vector["record"]))
        assert url == vector["request"]["target_uri"]
        # discover() always sends domain_alabel, so the client uses the db form.
        expected_accept_sig = pka_module._build_accept_signature_v2(keyid, vector["nonce"], domain_bound=True)
        assert _header(req, "Accept-Signature") == expected_accept_sig
        # AID-Domain must be the canonicalized queried host.
        assert _header(req, "AID-Domain") == "example.com"
        return _Resp(
            401,
            {
                "Cache-Control": vector["response"]["cache_control"],
                "Signature-Input": vector["response"]["signature_input"],
                "Signature": vector["response"]["signature"],
            },
            "",
        )

    class _FakeOpener:
        def open(self, req, timeout=2.0):
            return _fake_open(req, timeout)

    monkeypatch.setattr(urllib.request, "build_opener", lambda *args, **kwargs: _FakeOpener())

    rec, _ = discover("example.com", well_known_fallback=True)
    assert rec["v"] == "aid2"
    assert rec["pka"] == vector["record"]["k"]
    # The server replied with aid-pka-v2 (unbound); dual-tag acceptance → domain_bound False.
    assert rec.get("domain_bound") is False


def test_v2_pka_rejects_modified_response_signature(monkeypatch):
    import dns.resolver
    import urllib.request
    import aid_py.pka as pka_module

    vector = _vector_by_id("v2-rfc9421-response-signature")

    def _no_record(name, rdtype, lifetime=5.0):
        raise dns.resolver.NXDOMAIN()

    monkeypatch.setattr(dns.resolver, "resolve", _no_record)
    monkeypatch.setattr(pka_module.os, "urandom", lambda n: _b64url_decode(vector["nonce"]))
    monkeypatch.setattr(pka_module.time, "time", lambda: vector["created"] + 30)

    bad_signature = vector["response"]["signature"].replace("Tymq", "Aymq", 1)

    def _fake_open(req, timeout=2.0):
        url = req.full_url if hasattr(req, "full_url") else req
        if url.endswith("/.well-known/agent"):
            return _Resp(200, {"Content-Type": "application/json"}, json.dumps(vector["record"]))
        return _Resp(
            401,
            {
                "Cache-Control": vector["response"]["cache_control"],
                "Signature-Input": vector["response"]["signature_input"],
                "Signature": bad_signature,
            },
            "",
        )

    class _FakeOpener:
        def open(self, req, timeout=2.0):
            return _fake_open(req, timeout)

    monkeypatch.setattr(urllib.request, "build_opener", lambda *args, **kwargs: _FakeOpener())

    with pytest.raises(AidError) as exc_info:
        discover("example.com", well_known_fallback=True)
    assert exc_info.value.error_code == "ERR_SECURITY"


def test_v2_pka_rejects_redirect_response(monkeypatch):
    import dns.resolver
    import urllib.request
    import aid_py.pka as pka_module

    vector = _vector_by_id("v2-rfc9421-response-signature")

    def _no_record(name, rdtype, lifetime=5.0):
        raise dns.resolver.NXDOMAIN()

    monkeypatch.setattr(dns.resolver, "resolve", _no_record)
    monkeypatch.setattr(pka_module.os, "urandom", lambda n: _b64url_decode(vector["nonce"]))
    monkeypatch.setattr(pka_module.time, "time", lambda: vector["created"] + 30)

    def _fake_open(req, timeout=2.0):
        url = req.full_url if hasattr(req, "full_url") else req
        if url.endswith("/.well-known/agent"):
            return _Resp(200, {"Content-Type": "application/json"}, json.dumps(vector["record"]))
        return _Resp(302, {"Location": "https://elsewhere.example.com/"}, "")

    class _FakeOpener:
        def open(self, req, timeout=2.0):
            return _fake_open(req, timeout)

    monkeypatch.setattr(urllib.request, "build_opener", lambda *args, **kwargs: _FakeOpener())

    with pytest.raises(AidError) as exc_info:
        discover("example.com", well_known_fallback=True)
    assert exc_info.value.error_code == "ERR_SECURITY"


def test_v2_request_authority_preserves_ipv6_brackets_and_port():
    import aid_py.pka as pka_module

    assert pka_module._request_authority("https://[2001:db8::1]:8443/mcp") == "[2001:db8::1]:8443"
    assert pka_module._request_authority("https://[2001:db8::1]/mcp") == "[2001:db8::1]"


@pytest.mark.parametrize("param", ["nonce", "keyid", "alg", "created", "expires", "tag"])
def test_v2_signature_input_rejects_duplicate_critical_params(param):
    import aid_py.pka as pka_module

    vector = _vector_by_id("v2-rfc9421-response-signature")
    keyid = re.search(r'keyid="([^"]+)"', vector["response"]["signature_input"])
    assert keyid is not None
    duplicate_value = {
        "nonce": f'"{vector["nonce"]}"',
        "keyid": f'"{keyid.group(1)}"',
        "alg": '"ed25519"',
        "created": str(vector["created"]),
        "expires": str(vector["expires"]),
        "tag": '"aid-pka-v2"',
    }[param]
    headers = {
        "Signature-Input": f'{vector["response"]["signature_input"]};{param}={duplicate_value}',
        "Signature": vector["response"]["signature"],
    }

    with pytest.raises(AidError) as exc_info:
        pka_module._parse_v2_signature_headers(headers)
    assert exc_info.value.error_code == "ERR_SECURITY"


def test_v2_signature_input_rejects_trailing_bytes_after_quoted_param():
    import aid_py.pka as pka_module

    vector = _vector_by_id("v2-rfc9421-response-signature")
    headers = {
        "Signature-Input": vector["response"]["signature_input"].replace(
            f'nonce="{vector["nonce"]}"',
            'nonce="n"junk',
        ),
        "Signature": vector["response"]["signature"],
    }

    with pytest.raises(AidError) as exc_info:
        pka_module._parse_v2_signature_headers(headers)
    assert exc_info.value.error_code == "ERR_SECURITY"


@pytest.mark.parametrize(
    ("canonical", "mixed_case"),
    [
        ("created", "Created"),
        ("keyid", "KeyID"),
        ("alg", "ALG"),
    ],
)
def test_v2_signature_input_rejects_mixed_case_top_level_params(canonical, mixed_case):
    import aid_py.pka as pka_module

    vector = _vector_by_id("v2-rfc9421-response-signature")
    headers = {
        "Signature-Input": vector["response"]["signature_input"].replace(
            f";{canonical}=",
            f";{mixed_case}=",
            1,
        ),
        "Signature": vector["response"]["signature"],
    }

    with pytest.raises(AidError) as exc_info:
        pka_module._parse_v2_signature_headers(headers)
    assert exc_info.value.error_code == "ERR_SECURITY"


@pytest.mark.parametrize(
    ("case_id", "mutate"),
    [
        ("duplicate_req", lambda value: value.replace('"@method";req', '"@method";req;req', 1)),
        ("uppercase_req", lambda value: value.replace('"@method";req', '"@method";REQ', 1)),
        ("mixed_case_req", lambda value: value.replace('"@method";req', '"@method";ReQ', 1)),
        ("uppercase_component", lambda value: value.replace('"@method";req', '"@METHOD";req', 1)),
        ("unknown_param", lambda value: value.replace('"@method";req', '"@method";req;foo', 1)),
        ("duplicate_name", lambda value: value.replace('"@target-uri";req', '"@method";req', 1)),
        ("missing_required", lambda value: value.replace(' "@authority";req', "", 1)),
        ("extra_date", lambda value: value.replace('"@status"', '"date" "@status"', 1)),
    ],
    ids=lambda case: case if isinstance(case, str) else None,
)
def test_v2_signature_input_rejects_invalid_covered_items(case_id, mutate):
    import aid_py.pka as pka_module

    vector = _vector_by_id("v2-rfc9421-response-signature")
    headers = {
        "Signature-Input": mutate(vector["response"]["signature_input"]),
        "Signature": vector["response"]["signature"],
    }

    with pytest.raises(AidError) as exc_info:
        pka_module._parse_v2_signature_headers(headers)
    assert exc_info.value.error_code == "ERR_SECURITY"


@pytest.mark.parametrize("header_name", ["Signature-Input", "Signature"])
def test_v2_headers_reject_duplicate_aid_pka_dictionary_member(header_name):
    import aid_py.pka as pka_module

    vector = _vector_by_id("v2-rfc9421-response-signature")
    headers = {
        "Signature-Input": vector["response"]["signature_input"],
        "Signature": vector["response"]["signature"],
    }
    source = "signature_input" if header_name == "Signature-Input" else "signature"
    headers[header_name] = f'{vector["response"][source]}, {vector["response"][source]}'

    with pytest.raises(AidError) as exc_info:
        pka_module._parse_v2_signature_headers(headers)
    assert exc_info.value.error_code == "ERR_SECURITY"


@pytest.mark.parametrize("header_name", ["Signature-Input", "Signature"])
def test_v2_headers_reject_case_confused_aid_pka_dictionary_member(header_name):
    import aid_py.pka as pka_module

    vector = _vector_by_id("v2-rfc9421-response-signature")
    headers = {
        "Signature-Input": vector["response"]["signature_input"],
        "Signature": vector["response"]["signature"],
    }
    source = "signature_input" if header_name == "Signature-Input" else "signature"
    duplicate_member = vector["response"][source].split("=", 1)[1]
    headers[header_name] = f'{vector["response"][source]}, AID-PKA={duplicate_member}'

    with pytest.raises(AidError) as exc_info:
        pka_module._parse_v2_signature_headers(headers)
    assert exc_info.value.error_code == "ERR_SECURITY"


@pytest.mark.parametrize("header_name", ["Signature-Input", "Signature"])
def test_v2_headers_reject_duplicate_aid_pka_member_across_repeated_header_values(header_name):
    import aid_py.pka as pka_module

    class _RepeatedHeaders(dict):
        def get_all(self, name):
            value = self.get(name)
            if value is None:
                return None
            if name.lower() == header_name.lower():
                return [value, value]
            return [value]

    vector = _vector_by_id("v2-rfc9421-response-signature")
    headers = _RepeatedHeaders(
        {
            "Signature-Input": vector["response"]["signature_input"],
            "Signature": vector["response"]["signature"],
        }
    )

    with pytest.raises(AidError) as exc_info:
        pka_module._parse_v2_signature_headers(headers)
    assert exc_info.value.error_code == "ERR_SECURITY"


def test_v2_signature_input_rejects_unknown_top_level_param():
    import aid_py.pka as pka_module

    vector = _vector_by_id("v2-rfc9421-response-signature")
    headers = {
        "Signature-Input": f'{vector["response"]["signature_input"]};foo="bar"',
        "Signature": vector["response"]["signature"],
    }

    with pytest.raises(AidError) as exc_info:
        pka_module._parse_v2_signature_headers(headers)
    assert exc_info.value.error_code == "ERR_SECURITY"


@pytest.mark.parametrize("param", ["created", "expires"])
def test_v2_signature_input_rejects_quoted_integer_params(param):
    import aid_py.pka as pka_module

    vector = _vector_by_id("v2-rfc9421-response-signature")
    value = str(vector[param])
    headers = {
        "Signature-Input": vector["response"]["signature_input"].replace(
            f"{param}={value}",
            f'{param}="{value}"',
        ),
        "Signature": vector["response"]["signature"],
    }

    with pytest.raises(AidError) as exc_info:
        pka_module._parse_v2_signature_headers(headers)
    assert exc_info.value.error_code == "ERR_SECURITY"


def test_v2_pka_rejects_db_signature_missing_aid_domain_coverage(monkeypatch):
    """Fail vector: aid-pka-v2-db tag with only 4 covered items (no aid-domain) must be rejected."""
    import dns.resolver
    import urllib.request
    import aid_py.pka as pka_module

    vector = _vector_by_id("v2-db-missing-aid-domain-coverage")

    def _no_record(name, rdtype, lifetime=5.0):
        raise dns.resolver.NXDOMAIN()

    monkeypatch.setattr(dns.resolver, "resolve", _no_record)
    monkeypatch.setattr(pka_module.os, "urandom", lambda n: _b64url_decode(vector["nonce"]))
    monkeypatch.setattr(pka_module.time, "time", lambda: vector["created"] + 30)

    def _fake_open(req, timeout=2.0):
        url = req.full_url if hasattr(req, "full_url") else req
        if url.endswith("/.well-known/agent"):
            return _Resp(200, {"Content-Type": "application/json"}, json.dumps(vector["record"]))
        return _Resp(
            vector["response"]["status"],
            {
                "Cache-Control": vector["response"]["cache_control"],
                "Signature-Input": vector["response"]["signature_input"],
                "Signature": vector["response"]["signature"],
            },
            "",
        )

    class _FakeOpener:
        def open(self, req, timeout=2.0):
            return _fake_open(req, timeout)

    monkeypatch.setattr(urllib.request, "build_opener", lambda *args, **kwargs: _FakeOpener())

    with pytest.raises(AidError) as exc_info:
        discover("example.com", well_known_fallback=True)
    assert exc_info.value.error_code == "ERR_SECURITY"


def test_v2_pka_accepts_domain_bound_signature(monkeypatch):
    """Pass vector: aid-pka-v2-db with aid-domain covered; AID-Domain header sent; domain_bound=True."""
    import dns.resolver
    import urllib.request
    import aid_py.pka as pka_module

    vector = _vector_by_id("v2-db-rfc9421-domain-bound")

    def _no_record(name, rdtype, lifetime=5.0):
        raise dns.resolver.NXDOMAIN()

    monkeypatch.setattr(dns.resolver, "resolve", _no_record)
    monkeypatch.setattr(pka_module.os, "urandom", lambda n: _b64url_decode(vector["nonce"]))
    monkeypatch.setattr(pka_module.time, "time", lambda: vector["created"] + 30)

    captured_aid_domain: list[str] = []

    def _fake_open(req, timeout=2.0):
        url = req.full_url if hasattr(req, "full_url") else req
        if url.endswith("/.well-known/agent"):
            return _Resp(200, {"Content-Type": "application/json"}, json.dumps(vector["record"]))
        # Capture and assert the AID-Domain header
        aid_domain_hdr = _header(req, "AID-Domain")
        captured_aid_domain.append(aid_domain_hdr or "")
        return _Resp(
            vector["response"]["status"],
            {
                "Cache-Control": vector["response"]["cache_control"],
                "Signature-Input": vector["response"]["signature_input"],
                "Signature": vector["response"]["signature"],
            },
            "",
        )

    class _FakeOpener:
        def open(self, req, timeout=2.0):
            return _fake_open(req, timeout)

    monkeypatch.setattr(urllib.request, "build_opener", lambda *args, **kwargs: _FakeOpener())

    rec, _ = discover("example.com", well_known_fallback=True)
    assert rec["v"] == "aid2"
    assert rec.get("domain_bound") is True
    assert captured_aid_domain and captured_aid_domain[0] == vector["request"]["aid_domain"]


def test_v2_pka_no_domain_handshake_sends_legacy_accept_signature(monkeypatch):
    """Calling the v2 handshake directly with domain=None sends the legacy 4-component
    aid-pka-v2 Accept-Signature (no AID-Domain header). This path is no longer exercised
    by discover() — which always passes domain_alabel — so it is tested here directly."""
    import urllib.request
    import aid_py.pka as pka_module

    vector = _vector_by_id("v2-rfc9421-response-signature")

    # Derive keyid from the vector's response signature_input.
    keyid_match = re.search(r'keyid="([^"]+)"', vector["response"]["signature_input"])
    assert keyid_match is not None, "keyid not found in vector response signature_input"
    keyid = keyid_match.group(1)

    monkeypatch.setattr(pka_module.os, "urandom", lambda n: _b64url_decode(vector["nonce"]))
    monkeypatch.setattr(pka_module.time, "time", lambda: vector["created"] + 30)

    def _fake_open(req, timeout=2.0):
        # Assert: no AID-Domain header is sent when domain=None.
        assert _header(req, "AID-Domain") is None
        # Assert: the legacy 4-component (non-db) Accept-Signature is used.
        expected_accept_sig = pka_module._build_accept_signature_v2(keyid, vector["nonce"], domain_bound=False)
        assert _header(req, "Accept-Signature") == expected_accept_sig
        return _Resp(
            401,
            {
                "Cache-Control": vector["response"]["cache_control"],
                "Signature-Input": vector["response"]["signature_input"],
                "Signature": vector["response"]["signature"],
            },
            "",
        )

    class _FakeOpener:
        def open(self, req, timeout=2.0):
            return _fake_open(req, timeout)

    monkeypatch.setattr(urllib.request, "build_opener", lambda *args, **kwargs: _FakeOpener())

    is_db = pka_module._perform_v2_pka_handshake(
        vector["request"]["target_uri"],
        vector["record"]["k"],
        domain=None,
    )
    # Unbound response → not domain-bound.
    assert is_db is False


def test_debug_write_does_not_create_package_debug_dir_by_default(tmp_path, monkeypatch):
    import aid_py.pka as pka_module

    fake_module = tmp_path / "site-packages" / "aid_py" / "pka.py"
    fake_module.parent.mkdir(parents=True)
    fake_module.write_text("")
    monkeypatch.setattr(pka_module, "__file__", str(fake_module))
    monkeypatch.delenv("AID_DEBUG_PKA_DIR", raising=False)

    pka_module._debug_write("probe.txt", "debug")

    assert not (fake_module.parent / "_debug" / "probe.txt").exists()
