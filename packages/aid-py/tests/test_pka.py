# MIT License
# Copyright (c) 2025 Agent Community
# PKA handshake tests (quoted keyid, missing fields, Date skew)

import sys, pathlib, json, types, time
import pytest

sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

from aid_py import discover, AidError  # noqa: E402


cryptography = pytest.importorskip("cryptography")
from cryptography.hazmat.primitives.asymmetric import ed25519  # type: ignore # noqa: E402
from cryptography.hazmat.primitives import serialization  # type: ignore # noqa: E402


class _FakeHTTPMessage(dict):
    def items(self):  # pragma: no cover - compatibility
        return super().items()


class _FakeHTTPResponse:
    def __init__(self, status: int, headers: dict[str, str], body: str):
        self.status = status
        self.headers = _FakeHTTPMessage(headers)
        self._body = body.encode()

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def _build_base(order: list[str], *, challenge: str, method: str, target: str, host: str, date: str, created: int, kid: str):
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
        else:
            raise AssertionError("unexpected covered item: " + item)
    quoted = " ".join(f'"{c}"' for c in order)
    params_str = f"({quoted});created={created};keyid=\"{kid}\";alg=\"ed25519\""
    lines.append(f'"@signature-params": {params_str}')
    return "\n".join(lines).encode("utf-8"), params_str


def test_pka_accepts_quoted_keyid(monkeypatch):
    import dns.resolver

    def _no_record(name, rdtype, lifetime=5.0):
        raise dns.resolver.NXDOMAIN()

    monkeypatch.setattr(dns.resolver, "resolve", _no_record)

    # Generate an Ed25519 keypair
    private_key = ed25519.Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    raw_pub = public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )

    # Base58btc (z...) encode manually in test using Python's int conversion
    ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

    def b58encode(data: bytes) -> str:
        n = int.from_bytes(data, "big")
        out = ""
        while n > 0:
            n, rem = divmod(n, 58)
            out = ALPHABET[rem] + out
        # preserve leading zeros
        pad = 0
        for b in data:
            if b == 0:
                pad += 1
            else:
                break
        return "1" * pad + out

    pka = "z" + b58encode(raw_pub)
    kid = "g1"
    now = int(time.time())
    order = ["AID-Challenge", "@method", "@target-uri", "host", "date"]

    import urllib.request

    def _fake_open(req, timeout=2.0):
        url = req.full_url if hasattr(req, "full_url") else req
        if url.endswith("/.well-known/agent"):
            headers = {"Content-Type": "application/json"}
            body = json.dumps({"v": "aid1", "u": "https://api.example.com/mcp", "p": "mcp", "k": pka, "i": kid})
            return _FakeHTTPResponse(200, headers, body)
        # handshake
        def _h(name: str):
            # Try common access patterns across urllib implementations
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
                # case-insensitive fallback
                for k, val in req.headers.items():
                    if k.lower() == name.lower():
                        v = val
                        break
            return v
        challenge = _h("AID-Challenge")
        date = _h("Date")
        method = "GET"
        target = url
        host = pathlib.PurePosixPath(url).name if "://" not in url else __import__("urllib.parse").parse.urlparse(url).netloc
        base, params_str = _build_base(order, challenge=challenge, method=method, target=target, host=host, date=date, created=now, kid=kid)
        sig = private_key.sign(base)
        quoted = ' '.join([f'"{c}"' for c in order])
        headers = {
            "Signature-Input": f"sig=({quoted});created={now};keyid=\"{kid}\";alg=\"ed25519\"",
            "Signature": f"sig=:{__import__('base64').b64encode(sig).decode()}:",
            "Date": date,
        }
        return _FakeHTTPResponse(200, headers, "")

    class _FakeOpener:
        def open(self, req, timeout=2.0):
            return _fake_open(req, timeout)

    monkeypatch.setattr(urllib.request, "build_opener", lambda *args, **kwargs: _FakeOpener())

    record, _ = discover("example.com", well_known_fallback=True)
    assert record["pka"] == pka


def test_pka_rejects_missing_required_fields(monkeypatch):
    import dns.resolver

    def _no_record(name, rdtype, lifetime=5.0):
        raise dns.resolver.NXDOMAIN()

    monkeypatch.setattr(dns.resolver, "resolve", _no_record)

    private_key = ed25519.Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    raw_pub = public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

    def b58encode(data: bytes) -> str:
        n = int.from_bytes(data, "big")
        out = ""
        while n > 0:
            n, rem = divmod(n, 58)
            out = ALPHABET[rem] + out
        pad = 0
        for b in data:
            if b == 0:
                pad += 1
            else:
                break
        return "1" * pad + out

    pka = "z" + b58encode(raw_pub)
    kid = "g1"
    now = int(time.time())
    bad_order = ["AID-Challenge", "@method"]  # missing fields

    import urllib.request

    def _fake_open(req, timeout=2.0):
        url = req.full_url if hasattr(req, "full_url") else req
        if url.endswith("/.well-known/agent"):
            headers = {"Content-Type": "application/json"}
            body = json.dumps({"v": "aid1", "u": "https://api.example.com/mcp", "p": "mcp", "k": pka, "i": kid})
            return _FakeHTTPResponse(200, headers, body)
        challenge = req.headers.get("AID-Challenge")
        date = req.headers.get("Date")
        method = "GET"
        target = url
        host = __import__("urllib.parse").parse.urlparse(url).netloc
        lines = []
        for item in bad_order:
            if item == "AID-Challenge":
                lines.append(f'"AID-Challenge": {challenge}')
            elif item == "@method":
                lines.append(f'"@method": {method}')
        quoted = ' '.join([f'"{c}"' for c in bad_order])
        params = f"({quoted});created={now};keyid={kid};alg=\"ed25519\""
        lines.append(f'"@signature-params": {params}')
        base = "\n".join(lines).encode("utf-8")
        sig = private_key.sign(base)
        headers = {
            "Signature-Input": f"sig=({quoted});created={now};keyid={kid};alg=\"ed25519\"",
            "Signature": f"sig=:{__import__('base64').b64encode(sig).decode()}:",
            "Date": date,
        }
        return _FakeHTTPResponse(200, headers, "")

    class _FakeOpener:
        def open(self, req, timeout=2.0):
            return _fake_open(req, timeout)

    monkeypatch.setattr(urllib.request, "build_opener", lambda *args, **kwargs: _FakeOpener())

    with pytest.raises(AidError) as ei:
        discover("example.com", well_known_fallback=True)
    assert getattr(ei.value, "error_code", "") == "ERR_SECURITY"


def test_pka_rejects_date_skew(monkeypatch):
    import dns.resolver

    def _no_record(name, rdtype, lifetime=5.0):
        raise dns.resolver.NXDOMAIN()

    monkeypatch.setattr(dns.resolver, "resolve", _no_record)

    private_key = ed25519.Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    raw_pub = public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

    def b58encode(data: bytes) -> str:
        n = int.from_bytes(data, "big")
        out = ""
        while n > 0:
            n, rem = divmod(n, 58)
            out = ALPHABET[rem] + out
        pad = 0
        for b in data:
            if b == 0:
                pad += 1
            else:
                break
        return "1" * pad + out

    pka = "z" + b58encode(raw_pub)
    kid = "g1"
    now = int(time.time())
    created = now - 1000
    order = ["AID-Challenge", "@method", "@target-uri", "host", "date"]

    import urllib.request

    def _fake_open(req, timeout=2.0):
        url = req.full_url if hasattr(req, "full_url") else req
        if url.endswith("/.well-known/agent"):
            headers = {"Content-Type": "application/json"}
            body = json.dumps({"v": "aid1", "u": "https://api.example.com/mcp", "p": "mcp", "k": pka, "i": kid})
            return _FakeHTTPResponse(200, headers, body)
        challenge = req.headers.get("AID-Challenge")
        # Set an old Date header to force skew failure
        from email.utils import formatdate

        date = formatdate(timeval=(now - 1000), usegmt=True)
        method = "GET"
        target = url
        host = __import__("urllib.parse").parse.urlparse(url).netloc
        lines = []
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
        quoted = ' '.join('"' + c + '"' for c in order)
        params = f"({quoted});created={created};keyid={kid};alg=\"ed25519\""
        lines.append(f'"@signature-params": {params}')
        base = "\n".join(lines).encode("utf-8")
        sig = private_key.sign(base)
        headers = {
            "Signature-Input": f"sig=({quoted});created={created};keyid={kid};alg=\"ed25519\"",
            "Signature": f"sig=:{__import__('base64').b64encode(sig).decode()}:",
            "Date": date,
        }
        return _FakeHTTPResponse(200, headers, "")

    class _FakeOpener:
        def open(self, req, timeout=2.0):
            return _fake_open(req, timeout)

    monkeypatch.setattr(urllib.request, "build_opener", lambda *args, **kwargs: _FakeOpener())

    with pytest.raises(AidError) as ei:
        discover("example.com", well_known_fallback=True)
    assert getattr(ei.value, "error_code", "") == "ERR_SECURITY"
