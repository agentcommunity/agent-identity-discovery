"""PKA endpoint-proof handshakes for AID.

AID v1 records use the legacy Public Key for Agent (pka) plus key id (kid)
flow. AID v2 records derive the RFC 9421 keyid from pka/k and verify the
nonce-bound Ed25519 endpoint proof without a DNS kid/i field.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import time
from urllib.parse import urlparse, urlunparse
import urllib.request
import urllib.error
from collections.abc import Iterable

from .parser import AidError
import pathlib
import tempfile
import logging


def _token_eq(left: str, right: str) -> bool:
    return hmac.compare_digest(left.encode("utf-8"), right.encode("utf-8"))


def _token_in(value: str, candidates: Iterable[str]) -> bool:
    return any(_token_eq(value, candidate) for candidate in candidates)


def _token_startswith(value: str, prefix: str) -> bool:
    return len(value) >= len(prefix) and _token_eq(value[: len(prefix)], prefix)


def _token_endswith(value: str, suffix: str) -> bool:
    return len(value) >= len(suffix) and _token_eq(value[-len(suffix) :], suffix)


def _ascii_lower_ct(s: str) -> str:
    """Performs ASCII lowercasing in a way that is less susceptible to timing attacks."""
    res = []
    for char in s:
        o = ord(char)
        # Check for uppercase ASCII 'A'-'Z' (65-90)
        is_upper = (65 <= o <= 90)
        res.append(chr(o + (32 * is_upper)))
    return "".join(res)

def _debug_write(name: str, data: str) -> None:
    """Write development-only PKA diagnostics outside the package by default."""
    try:
        configured_dir = os.environ.get("AID_DEBUG_PKA_DIR")
        d = pathlib.Path(configured_dir) if configured_dir else pathlib.Path(tempfile.gettempdir()) / "aid-py-pka-debug"
        d.mkdir(parents=True, exist_ok=True)
        (d / pathlib.Path(name).name).write_text(data)
    except Exception as e:
        # Intentionally swallowing error here for debug writing,
        # as failure to write debug data should not stop the main flow.
        # Log for visibility in debug builds.
        logging.debug(f"Failed to write debug data: {e}")


def _get_header(headers, name: str) -> str | None:
    for accessor_name in ("get_all", "getall"):
        accessor = getattr(headers, accessor_name, None)
        if not callable(accessor):
            continue
        values = None
        for candidate_name in (name, name.lower()):
            try:
                values = accessor(candidate_name)
            except Exception:
                values = None
            if values:
                break
        if values:
            return ", ".join(str(value) for value in values if value is not None)

    try:
        value = headers.get(name)
    except Exception:
        value = None
    if value is not None:
        return value
    lower = name.lower()
    try:
        items = headers.items()
    except Exception:
        return None
    for key, candidate in items:
        if str(key).lower() == lower:
            return candidate
    return None


def _response_status(resp) -> int:
    return int(getattr(resp, "status", getattr(resp, "code", 0)))


def _close_response(resp) -> None:
    close = getattr(resp, "close", None)
    if callable(close):
        close()


class _NoRedirect(urllib.request.HTTPRedirectHandler):  # type: ignore[attr-defined]
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # pragma: no cover
        return None


def _open_no_redirect(req, timeout: float):
    opener = urllib.request.build_opener(_NoRedirect())
    try:
        return opener.open(req, timeout=timeout)  # nosec B310
    except urllib.error.HTTPError as exc:
        return exc


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    if not re.fullmatch(r"[A-Za-z0-9_-]+", value) or "=" in value:
        raise AidError("ERR_SECURITY", "Invalid aid2 PKA encoding")
    if len(value) % 4 == 1:
        raise AidError("ERR_SECURITY", "Invalid aid2 PKA encoding")
    try:
        return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    except Exception:
        raise AidError("ERR_SECURITY", "Invalid aid2 PKA encoding") from None


def _verify_ed25519(public_key: bytes, signature: bytes, data: bytes) -> None:
    try:
        try:
            from nacl.signing import VerifyKey  # type: ignore

            VerifyKey(public_key).verify(data, signature)
            return
        except ImportError as e:
            logging.debug(f"PyNaCl not available, falling back to cryptography: {e}")
            from cryptography.hazmat.primitives.asymmetric import ed25519  # type: ignore
            from cryptography.exceptions import InvalidSignature  # type: ignore

            vk = ed25519.Ed25519PublicKey.from_public_bytes(public_key)
            try:
                vk.verify(signature, data)
            except InvalidSignature:
                raise AidError("ERR_SECURITY", "PKA signature verification failed") from None
    except AidError:
        raise
    except Exception as exc:  # pragma: no cover - missing libs
        raise AidError("ERR_SECURITY", f"PKA verification unavailable: {exc}") from None


def _b58_decode(s: str) -> bytes:
    alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    if not s:
        return b""
    zeros = 0
    while zeros < len(s) and s[zeros] == "1":
        zeros += 1
    # approximate size
    size = int(((len(s) - zeros) * (58).bit_length() / 8) + 1)
    b = [0] * size
    for ch in s[zeros:]:
        try:
            val = alphabet.index(ch)
        except ValueError:
            raise AidError("ERR_SECURITY", "Invalid base58 character") from None
        carry = val
        for j in range(size - 1, -1, -1):
            carry += 58 * b[j]
            b[j] = carry & 0xFF
            carry >>= 8
    # strip leading zeros in b
    it = 0
    while it < len(b) and b[it] == 0:
        it += 1
    out = bytes([0] * zeros + b[it:])
    return out


def _multibase_decode(s: str) -> bytes:
    if not s:
        raise AidError("ERR_SECURITY", "Empty PKA")
    prefix, payload = s[0], s[1:]
    if prefix == "z":
        return _b58_decode(payload)
    raise AidError("ERR_SECURITY", "Unsupported multibase prefix")


def _parse_signature_headers(headers) -> tuple[list[str], int, str, str, str, bytes, str | None]:
    sig_input = _get_header(headers, "Signature-Input")
    sig = _get_header(headers, "Signature")
    if not sig_input or not sig:
        raise AidError("ERR_SECURITY", "Missing signature headers")

    inside = re.search(r"sig=\(\s*([^)]*?)\s*\)", sig_input, flags=re.I)
    if not inside:
        raise AidError("ERR_SECURITY", "Invalid Signature-Input")
    covered: list[str] = re.findall(r'"([^"]+)"', inside.group(1))
    if not covered:
        raise AidError("ERR_SECURITY", "Invalid Signature-Input")
    required = {"aid-challenge", "@method", "@target-uri", "host", "date"}

    # Mitigate timing attack on covered headers validation.
    # The length check is not constant time, but it's a basic structural validation.
    if len(covered) != len(required):
        raise AidError("ERR_SECURITY", "Signature-Input must cover required fields")

    # Use constant-time comparison for the set of covered headers.
    covered_lowered = sorted([_ascii_lower_ct(c) for c in covered])
    required_sorted = sorted(list(required))

    are_equal = True
    # Constant-time iteration and comparison
    for i in range(len(required_sorted)):
        if not hmac.compare_digest(covered_lowered[i], required_sorted[i]):
            are_equal = False
            # Deliberately not breaking early

    if not are_equal:
        raise AidError("ERR_SECURITY", "Signature-Input must cover required fields")

    cm = re.search(r"(?:^|;)\s*created=(\d+)", sig_input, flags=re.I)
    km = re.search(r"(?:^|;)\s*keyid=([^;\s]+)", sig_input, flags=re.I)
    am = re.search(r"(?:^|;)\s*alg=\"([^\"]+)\"", sig_input, flags=re.I)
    if not cm or not km or not am:
        raise AidError("ERR_SECURITY", "Invalid Signature-Input")
    created = int(cm.group(1))
    keyid_raw = km.group(1)
    keyid = keyid_raw.strip('"')
    alg = am.group(1).lower()

    sm = re.search(r"sig\s*=\s*:\s*([^:]+)\s*:", sig, flags=re.I)
    if not sm:
        raise AidError("ERR_SECURITY", "Invalid Signature header")
    signature = base64.b64decode(sm.group(1))
    date_header = _get_header(headers, "Date")
    return covered, created, keyid, keyid_raw, alg, signature, date_header


def _build_signature_base(
    covered: list[str],
    *,
    created: int,
    keyid: str,
    alg: str,
    method: str,
    target_uri: str,
    host: str,
    date: str,
    challenge: str,
) -> bytes:
    lines: list[str] = []
    for item in covered:
        lower = _ascii_lower_ct(item)
        # Mitigate timing attacks by using a sequence of `if` checks
        # instead of an `if/elif` cascade to avoid short-circuiting.
        # This makes the execution time independent of the `item`'s value.
        appended = False
        if hmac.compare_digest(lower, "aid-challenge"):
            lines.append(f'"AID-Challenge": {challenge}')
            appended = True
        if hmac.compare_digest(lower, "@method"):
            lines.append(f'"@method": {method}')
            appended = True
        if hmac.compare_digest(lower, "@target-uri"):
            lines.append(f'"@target-uri": {target_uri}')
            appended = True
        if hmac.compare_digest(lower, "host"):
            lines.append(f'"host": {host}')
            appended = True
        if hmac.compare_digest(lower, "date"):
            lines.append(f'"date": {date}')
            appended = True

        if not appended:
            # This case should not be reached if _parse_signature_headers is correct.
            raise AidError("ERR_SECURITY", f"Unsupported covered field: {item}")

    quoted = " ".join(f'"{c}"' for c in covered)
    params = f"({quoted});created={created};keyid={keyid};alg=\"{alg}\""
    lines.append(f'"@signature-params": {params}')
    return "\n".join(lines).encode("utf-8")


def _split_dictionary_members(value: str) -> list[str]:
    parts: list[str] = []
    start = 0
    depth = 0
    in_quote = False
    in_bytes = False
    escaped = False
    for index, char in enumerate(value):
        if escaped:
            escaped = False
            continue
        if in_quote:
            if _token_eq(char, "\\"):
                escaped = True
            elif _token_eq(char, '"'):
                in_quote = False
            continue
        if _token_eq(char, '"'):
            in_quote = True
            continue
        if _token_eq(char, ":"):
            in_bytes = not in_bytes
            continue
        if in_bytes:
            continue
        if _token_eq(char, "("):
            depth += 1
            continue
        if _token_eq(char, ")") and depth > 0:
            depth -= 1
            continue
        if _token_eq(char, ",") and depth == 0:
            parts.append(value[start:index].strip())
            start = index + 1
    parts.append(value[start:].strip())
    return [part for part in parts if part]


def _extract_dictionary_member(value: str, member: str) -> str:
    prefix = f"{member}="
    found: str | None = None
    for part in _split_dictionary_members(value):
        label_end = len(part)
        for separator in ("=", ";"):
            separator_index = part.find(separator)
            if separator_index >= 0:
                label_end = min(label_end, separator_index)
        label = part[:label_end].strip()
        if _token_eq(_ascii_lower_ct(label), member) and not _token_eq(label, member):
            raise AidError("ERR_SECURITY", f"Duplicate {member} signature member")
        if _token_startswith(part, prefix):
            if found is not None:
                raise AidError("ERR_SECURITY", f"Duplicate {member} signature member")
            found = part[len(prefix):].strip()
    if found is not None:
        return found
    raise AidError("ERR_SECURITY", f"Missing {member} signature member")


def _split_inner_list_items(value: str) -> list[str]:
    items: list[str] = []
    index = 0
    while index < len(value):
        while index < len(value) and value[index].isspace():
            index += 1
        if index >= len(value):
            break
        match = re.match(r'"[^"]+"(?:;[A-Za-z0-9_*.-]+)*', value[index:])
        if not match:
            raise AidError("ERR_SECURITY", "Invalid Signature-Input covered item")
        items.append(match.group(0))
        index += len(match.group(0))
        if index < len(value) and not value[index].isspace():
            raise AidError("ERR_SECURITY", "Invalid Signature-Input covered item")
    return items


def _parse_signature_params(
    value: str,
    critical: set[str] | None = None,
    allowed: set[str] | None = None,
    bare_required: set[str] | None = None,
) -> dict[str, str]:
    critical = critical or set()
    bare_required = bare_required or set()
    params: dict[str, str] = {}
    index = 0
    while index < len(value):
        while index < len(value) and value[index].isspace():
            index += 1
        if index >= len(value):
            break
        if not _token_eq(value[index], ";"):
            raise AidError("ERR_SECURITY", "Invalid Signature-Input parameters")
        index += 1
        while index < len(value) and value[index].isspace():
            index += 1

        name_start = index
        while index < len(value) and re.match(r"[A-Za-z0-9_*.-]", value[index]):
            index += 1
        key = value[name_start:index]
        if not key:
            raise AidError("ERR_SECURITY", "Invalid Signature-Input parameter")
        if allowed is not None and not _token_in(key, allowed):
            raise AidError("ERR_SECURITY", "Unsupported Signature-Input parameter")
        if _token_in(key, critical) and _token_in(key, params):
            raise AidError("ERR_SECURITY", "Duplicate Signature-Input parameter")

        while index < len(value) and value[index].isspace():
            index += 1
        if index >= len(value) or not _token_eq(value[index], "="):
            params[key] = ""
            continue

        index += 1
        while index < len(value) and value[index].isspace():
            index += 1
        value_start = index
        if index < len(value) and _token_eq(value[index], '"'):
            index += 1
            escaped = False
            while index < len(value):
                char = value[index]
                if escaped:
                    escaped = False
                elif _token_eq(char, "\\"):
                    escaped = True
                elif _token_eq(char, '"'):
                    index += 1
                    break
                index += 1
            else:
                raise AidError("ERR_SECURITY", "Invalid Signature-Input parameter")
            raw = value[value_start:index].strip()
            while index < len(value) and value[index].isspace():
                index += 1
            if index < len(value) and not _token_eq(value[index], ";"):
                raise AidError("ERR_SECURITY", "Invalid Signature-Input parameters")
        else:
            while index < len(value) and not _token_eq(value[index], ";"):
                index += 1
            raw = value[value_start:index].strip()

        if _token_in(key, bare_required) and _token_startswith(raw, '"'):
            raise AidError("ERR_SECURITY", "Invalid Signature-Input parameter")
        if _token_startswith(raw, '"') and _token_endswith(raw, '"'):
            unquoted: list[str] = []
            escaped = False
            for char in raw[1:-1]:
                if escaped:
                    unquoted.append(char)
                    escaped = False
                elif _token_eq(char, "\\"):
                    escaped = True
                else:
                    unquoted.append(char)
            raw = "".join(unquoted)
        params[key] = raw
    return params


def _parse_v2_covered_item(raw: str) -> dict[str, object]:
    match = re.fullmatch(r'"([^"]+)"((?:;[A-Za-z0-9_*.-]+)*)', raw)
    if not match:
        raise AidError("ERR_SECURITY", "Invalid Signature-Input covered item")
    name = match.group(1)
    params = [part for part in match.group(2).split(";") if part]
    if not _token_in(name, ("@method", "@target-uri", "@authority", "@status", "aid-domain")):
        raise AidError("ERR_SECURITY", f"Unsupported covered field: {name}")
    seen_params: set[str] = set()
    for param in params:
        if _token_in(param, seen_params):
            raise AidError("ERR_SECURITY", "Duplicate Signature-Input covered item parameter")
        if not _token_eq(param, "req"):
            raise AidError("ERR_SECURITY", "Unsupported Signature-Input covered item parameter")
        seen_params.add(param)
    req = _token_in("req", seen_params)
    return {"raw": raw, "name": name, "req": req}


def _validate_v2_covered_set(covered: list[dict[str, object]]) -> bool:
    """Validate the covered set against the two permitted shapes and return whether the
    proof is domain-bound (i.e. the signed covered set includes "aid-domain";req).

    Shape A (unbound): @method;req @target-uri;req @authority;req @status
    Shape B (bound):   @method;req @target-uri;req @authority;req aid-domain;req @status

    The covered set lives in the signed @signature-params, so this distinction is
    authenticated. Compares BOTH name and the ;req flag at each position.
    """
    base: list[tuple[str, bool]] = [
        ("@method", True),
        ("@target-uri", True),
        ("@authority", True),
        ("@status", False),
    ]

    third = covered[3]["name"] if len(covered) > 3 else None
    domain_bound = len(covered) == len(base) + 1 and isinstance(third, str) and _token_eq(third, "aid-domain")

    expected: list[tuple[str, bool]] = (
        [base[0], base[1], base[2], ("aid-domain", True), base[3]] if domain_bound else base
    )

    if len(covered) != len(expected):
        raise AidError("ERR_SECURITY", "Signature-Input must cover required fields")

    for item, (name, req) in zip(covered, expected):
        item_name = item["name"]
        item_req = item["req"]
        if not isinstance(item_name, str) or not isinstance(item_req, bool):
            raise AidError("ERR_SECURITY", "Signature-Input must cover required fields")
        if not _token_eq(item_name, name) or item_req is not req:
            raise AidError("ERR_SECURITY", "Signature-Input must cover required fields")

    return domain_bound


def _parse_v2_signature_headers(headers) -> dict[str, object]:
    sig_input = _get_header(headers, "Signature-Input")
    sig = _get_header(headers, "Signature")
    if not sig_input or not sig:
        raise AidError("ERR_SECURITY", "Missing signature headers")

    signature_params_raw = _extract_dictionary_member(sig_input, "aid-pka")
    if not _token_startswith(signature_params_raw, "("):
        raise AidError("ERR_SECURITY", "Invalid Signature-Input")
    close_index = signature_params_raw.find(")")
    if close_index < 0:
        raise AidError("ERR_SECURITY", "Invalid Signature-Input")

    covered_raw = signature_params_raw[1:close_index].strip()
    params_raw = signature_params_raw[close_index + 1:]
    covered = [_parse_v2_covered_item(item) for item in _split_inner_list_items(covered_raw)]

    required = ("created", "expires", "keyid", "alg", "nonce", "tag")
    required_set = set(required)
    params = _parse_signature_params(
        params_raw,
        required_set,
        allowed=required_set,
        bare_required={"created", "expires"},
    )
    if any(not _token_in(param, params) for param in required):
        raise AidError("ERR_SECURITY", "Invalid Signature-Input")
    if not re.fullmatch(r"\d+", params["created"]) or not re.fullmatch(r"\d+", params["expires"]):
        raise AidError("ERR_SECURITY", "Invalid Signature-Input timestamp")
    domain_bound = _validate_v2_covered_set(covered)

    signature_raw = _extract_dictionary_member(sig, "aid-pka")
    sig_match = re.fullmatch(r":\s*([^:]+?)\s*:", signature_raw)
    if not sig_match:
        raise AidError("ERR_SECURITY", "Invalid Signature header")
    try:
        signature = base64.b64decode(sig_match.group(1), validate=True)
    except Exception:
        raise AidError("ERR_SECURITY", "Invalid Signature header") from None

    return {
        "covered": covered,
        "signature_params_raw": signature_params_raw,
        "created": int(params["created"]),
        "expires": int(params["expires"]),
        "keyid": params["keyid"],
        "alg": params["alg"],
        "nonce": params["nonce"],
        "tag": params["tag"],
        "domain_bound": domain_bound,
        "signature": signature,
    }


def _has_no_store_directive(cache_control: str | None) -> bool:
    if not cache_control:
        return False
    return any(
        _token_eq(part.strip().split(";", 1)[0].strip().lower(), "no-store")
        for part in cache_control.split(",")
    )


def _normalize_request_uri(uri: str) -> str:
    parsed = urlparse(uri)
    authority = _request_authority(uri)
    return urlunparse(parsed._replace(scheme=parsed.scheme.lower(), netloc=authority, fragment=""))


def _request_authority(uri: str) -> str:
    parsed = urlparse(uri)
    hostname = (parsed.hostname or "").lower()
    if not hostname:
        raise AidError("ERR_SECURITY", "Invalid URI for handshake")
    host = f"[{hostname}]" if ":" in hostname and not hostname.startswith("[") else hostname
    try:
        port = parsed.port
    except ValueError:
        raise AidError("ERR_SECURITY", "Invalid URI for handshake") from None
    if port and not (
        (parsed.scheme == "https" and port == 443)
        or (parsed.scheme == "http" and port == 80)
    ):
        return f"{host}:{port}"
    return host


def _canonicalize_aid_domain(domain: str) -> str:
    """Normalize an AID-Domain value: ASCII-lowercase, strip exactly one trailing dot,
    and validate the charset [a-z0-9.:[]_-]. Raises ERR_SECURITY on invalid input."""
    value = _ascii_lower_ct(domain.strip())
    if value.endswith("."):
        value = value[:-1]
    if not value:
        raise AidError("ERR_SECURITY", "Invalid AID-Domain value")
    if not re.fullmatch(r"[a-z0-9.:\[\]_-]+", value):
        raise AidError("ERR_SECURITY", "Invalid AID-Domain value")
    return value


def _build_v2_signature_base(
    covered: list[dict[str, object]],
    signature_params_raw: str,
    *,
    method: str,
    target_uri: str,
    authority: str,
    status: int,
    aid_domain: str | None = None,
) -> bytes:
    lines: list[str] = []
    for item in covered:
        name = item["name"]
        req = bool(item["req"])
        suffix = ";req" if req else ""
        if _token_eq(name, "@method"):
            lines.append(f'"@method"{suffix}: {method}')
        elif _token_eq(name, "@target-uri"):
            lines.append(f'"@target-uri"{suffix}: {target_uri}')
        elif _token_eq(name, "@authority"):
            lines.append(f'"@authority"{suffix}: {authority}')
        elif _token_eq(name, "aid-domain"):
            if aid_domain is None:
                raise AidError("ERR_SECURITY", "Signature covers aid-domain but no AID-Domain was sent")
            lines.append(f'"aid-domain"{suffix}: {aid_domain}')
        elif _token_eq(name, "@status"):
            lines.append(f'"@status"{suffix}: {status}')
        else:
            raise AidError("ERR_SECURITY", f"Unsupported covered field: {name}")
    lines.append(f'"@signature-params": {signature_params_raw}')
    return "\n".join(lines).encode("utf-8")


def _derive_aid2_key_material(pka: str) -> tuple[bytes, str]:
    public_key = _b64url_decode(pka)
    if len(public_key) != 32:
        raise AidError("ERR_SECURITY", "Invalid PKA length")
    thumbprint_input = f'{{"crv":"Ed25519","kty":"OKP","x":"{pka}"}}'.encode("utf-8")
    keyid = _b64url_encode(hashlib.sha256(thumbprint_input).digest())
    return public_key, keyid


def _build_accept_signature_v2(keyid: str, nonce: str, domain_bound: bool = False) -> str:
    # The tag is a fixed profile identifier (RFC 9421 2.3); domain binding is signalled by
    # including "aid-domain";req in the covered set, not by a distinct tag.
    if domain_bound:
        covered = '"@method";req "@target-uri";req "@authority";req "aid-domain";req "@status"'
    else:
        covered = '"@method";req "@target-uri";req "@authority";req "@status"'
    return f'aid-pka=({covered});created;expires;keyid="{keyid}";alg="ed25519";nonce="{nonce}";tag="aid-pka-v2"'


def _perform_v1_pka_handshake(uri: str, pka: str, kid: str, *, timeout: float = 2.0) -> None:
    if not kid:
        raise AidError("ERR_SECURITY", "Missing kid for PKA")
    parsed = urlparse(uri)
    if not parsed.scheme or not parsed.netloc:
        raise AidError("ERR_SECURITY", "Invalid URI for handshake")

    # Prepare request
    nonce = os.urandom(32)
    challenge = base64.urlsafe_b64encode(nonce).decode("ascii").rstrip("=")
    date_hdr = time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime())
    req = urllib.request.Request(uri, headers={"AID-Challenge": challenge, "Date": date_hdr})

    try:
        resp = _open_no_redirect(req, timeout)
        try:
            status = _response_status(resp)
            if status != 200:
                raise AidError("ERR_SECURITY", f"Handshake HTTP {status}")
            headers = resp.headers
        finally:
            _close_response(resp)
    except AidError:
        raise
    except Exception as exc:  # pragma: no cover - network errors
        raise AidError("ERR_SECURITY", str(exc)) from None

    covered, created, keyid, keyid_raw, alg, signature, date_header = _parse_signature_headers(headers)
    now = int(time.time())
    if abs(now - created) > 300:
        raise AidError("ERR_SECURITY", "Signature created timestamp outside acceptance window")
    if date_header:
        try:
            from email.utils import parsedate_to_datetime  # stdlib

            dt = parsedate_to_datetime(date_header)
            epoch = int(dt.timestamp())
        except ValueError as e:
            logging.exception(f"Failed to parse Date header: {e}")
            raise AidError("ERR_SECURITY", "Invalid Date header") from None
        if abs(now - epoch) > 300:
            raise AidError("ERR_SECURITY", "HTTP Date header outside acceptance window")
    if not hmac.compare_digest(keyid.encode('utf-8'), kid.encode('utf-8')):
        raise AidError("ERR_SECURITY", "Signature keyid mismatch")
    if not hmac.compare_digest(alg.encode('utf-8'), b"ed25519"):
        raise AidError("ERR_SECURITY", "Unsupported signature algorithm")

    # Match TS reference (URL.host): hostname+port WITHOUT any userinfo component.
    # urlparse().netloc includes userinfo (user:pass@host:port), so strip it.
    host = parsed.netloc.rsplit("@", 1)[-1]
    base = _build_signature_base(
        covered,
        created=created,
        keyid=keyid_raw,
        alg=alg,
        method="GET",
        target_uri=uri,
        host=host,
        date=date_header or date_hdr,
        challenge=challenge,
    )
    if os.environ.get("AID_DEBUG_PKA") == "1":
        _debug_write("base_runtime.txt", base.decode("utf-8", errors="ignore"))

    pub = _multibase_decode(pka)
    if len(pub) != 32:
        raise AidError("ERR_SECURITY", "Invalid PKA length")

    _verify_ed25519(pub, signature, base)


def _perform_v2_pka_handshake(uri: str, pka: str, *, domain: str | None = None, timeout: float = 2.0) -> bool:
    """Perform a v2 PKA handshake. Returns True if the response is domain-bound
    (its signed covered set includes "aid-domain";req)."""
    public_key, expected_keyid = _derive_aid2_key_material(pka)
    nonce = _b64url_encode(os.urandom(32))
    request_uri = _normalize_request_uri(uri)
    authority = _request_authority(request_uri)

    # Canonicalize ONCE and thread the SAME value to both the request header and the sig base.
    canonical_domain: str | None = None
    if domain:
        canonical_domain = _canonicalize_aid_domain(domain)

    req_headers: dict[str, str] = {
        "Accept-Signature": _build_accept_signature_v2(expected_keyid, nonce, domain_bound=canonical_domain is not None),
        "Cache-Control": "no-store",
    }
    if canonical_domain is not None:
        req_headers["AID-Domain"] = canonical_domain

    req = urllib.request.Request(
        request_uri,
        headers=req_headers,
        method="GET",
    )

    try:
        resp = _open_no_redirect(req, timeout)
        try:
            status = _response_status(resp)
            if 300 <= status < 400:
                raise AidError("ERR_SECURITY", "PKA redirects are not allowed")
            headers = resp.headers
            if not _has_no_store_directive(_get_header(headers, "Cache-Control")):
                raise AidError("ERR_SECURITY", "PKA response must include Cache-Control: no-store")
            parsed = _parse_v2_signature_headers(headers)
        finally:
            _close_response(resp)
    except AidError:
        raise
    except Exception as exc:  # pragma: no cover - network errors
        raise AidError("ERR_SECURITY", str(exc)) from None

    created = parsed["created"]
    expires = parsed["expires"]
    if not isinstance(created, int) or not isinstance(expires, int):
        raise AidError("ERR_SECURITY", "Invalid Signature-Input timestamp")
    now = int(time.time())
    skew_seconds = 30
    if expires <= created or expires - created > 300:
        raise AidError("ERR_SECURITY", "Invalid signature freshness window")
    if created - now > skew_seconds or now - expires > skew_seconds:
        raise AidError("ERR_SECURITY", "Signature timestamp outside acceptance window")

    keyid = parsed["keyid"]
    alg = parsed["alg"]
    response_nonce = parsed["nonce"]
    tag = parsed["tag"]
    if not isinstance(keyid, str) or not hmac.compare_digest(keyid.encode("utf-8"), expected_keyid.encode("utf-8")):
        raise AidError("ERR_SECURITY", "Signature keyid mismatch")
    if not isinstance(alg, str) or not hmac.compare_digest(_ascii_lower_ct(alg).encode("utf-8"), b"ed25519"):
        raise AidError("ERR_SECURITY", "Unsupported signature algorithm")
    if not isinstance(response_nonce, str) or not hmac.compare_digest(response_nonce.encode("utf-8"), nonce.encode("utf-8")):
        raise AidError("ERR_SECURITY", "Signature nonce mismatch")
    if not isinstance(tag, str) or not _token_eq(tag, "aid-pka-v2"):
        raise AidError("ERR_SECURITY", "Invalid signature tag")

    # Domain binding is derived from the signed covered set (aid-domain coverage), not the tag.
    domain_bound = parsed["domain_bound"]
    if not isinstance(domain_bound, bool):
        raise AidError("ERR_SECURITY", "Invalid Signature-Input")
    # Primary protection: a response that covers aid-domain is only meaningful when the client
    # committed to a domain via the AID-Domain header. Reject otherwise (fail closed).
    if domain_bound and canonical_domain is None:
        raise AidError("ERR_SECURITY", "Response covers aid-domain but no AID-Domain was sent")

    covered = parsed["covered"]
    signature_params_raw = parsed["signature_params_raw"]
    signature = parsed["signature"]
    if not isinstance(covered, list) or not isinstance(signature_params_raw, str) or not isinstance(signature, bytes):
        raise AidError("ERR_SECURITY", "Invalid Signature-Input")

    base = _build_v2_signature_base(
        covered,
        signature_params_raw,
        method="GET",
        target_uri=request_uri,
        authority=authority,
        status=status,
        aid_domain=canonical_domain,
    )
    _verify_ed25519(public_key, signature, base)
    return domain_bound


def perform_pka_handshake(uri: str, pka: str, kid: str | None = None, *, domain: str | None = None, timeout: float = 2.0) -> bool:
    """Perform a PKA handshake. Returns True if the response is domain-bound, False otherwise.

    A v2 proof is domain-bound iff its signed covered set includes "aid-domain";req."""
    if kid is not None:
        _perform_v1_pka_handshake(uri, pka, kid, timeout=timeout)
        return False
    return _perform_v2_pka_handshake(uri, pka, domain=domain, timeout=timeout)
