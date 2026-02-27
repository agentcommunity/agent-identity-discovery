# MIT License
# Copyright (c) 2025 Agent Community
# Author: Agent Community
# Repository: https://github.com/agentcommunity/agent-identity-discovery
"""DNS discovery client for Agent Identity & Discovery (AID).

Uses `dnspython` to query the `_agent.<domain>` TXT record, validates it
with `aid_py.parse`, and returns the parsed record together with the DNS TTL.
"""
from __future__ import annotations

from typing import Tuple

import dns.exception
import dns.resolver

from .constants import DNS_SUBDOMAIN, DNS_TTL_MIN
from .parser import AidError, parse
from . import parser as _parser

try:  # Optional import to avoid circulars in type checkers
    from .pka import perform_pka_handshake  # type: ignore
except Exception:  # pragma: no cover - import-time optional
    perform_pka_handshake = None  # type: ignore

__all__ = ["discover"]


def _query_txt_record(fqdn: str, timeout: float) -> Tuple[list[str], int]:
    """Return list of TXT strings and TTL or raise AidError on DNS failure."""

    try:
        answers = dns.resolver.resolve(fqdn, "TXT", lifetime=timeout)
    except dns.resolver.NXDOMAIN as exc:
        raise AidError("ERR_NO_RECORD", str(exc)) from None
    except (dns.resolver.Timeout, dns.exception.DNSException) as exc:
        raise AidError("ERR_DNS_LOOKUP_FAILED", str(exc)) from None

    # dnspython joins multi-string automatically? Actually each answer.rdata.strings
    ttl = answers.rrset.ttl if answers.rrset else DNS_TTL_DEFAULT
    txt_strings: list[str] = []
    for rdata in answers:
        # each rdata.strings is a tuple of bytes segments
        txt_strings.append("".join(seg.decode() for seg in rdata.strings))
    return txt_strings, ttl


DNS_TTL_DEFAULT = 300  # fallback


def discover(
    domain: str,
    *,
    protocol: str | None = None,
    timeout: float = 5.0,
    well_known_fallback: bool = True,
    well_known_timeout: float = 2.0,
    **kwargs,
) -> Tuple[dict, int]:
    """Discover and validate the AID record for *domain*.

    Can optionally try a protocol-specific subdomain first.

    Returns a tuple `(record_dict, ttl_seconds)`.
    Raises `AidError` on any failure as per the specification.
    """

    # Optional camelCase kwargs aliases for non-breaking compatibility
    # wellKnownFallback / wellKnownTimeoutMs
    if "wellKnownFallback" in kwargs:
        import warnings

        warnings.warn(
            "wellKnownFallback is deprecated; use well_known_fallback",
            DeprecationWarning,
            stacklevel=2,
        )
        well_known_fallback = bool(kwargs["wellKnownFallback"])  # type: ignore[assignment]
    if "wellKnownTimeoutMs" in kwargs:
        import warnings

        warnings.warn(
            "wellKnownTimeoutMs is deprecated; use well_known_timeout (seconds)",
            DeprecationWarning,
            stacklevel=2,
        )
        try:
            ms = float(kwargs["wellKnownTimeoutMs"])  # type: ignore[arg-type]
        except Exception:
            ms = 0.0
        if ms > 0:
            well_known_timeout = ms / 1000.0  # type: ignore[assignment]

    # IDN → A-label conversion per RFC5890
    try:
        import idna

        domain_alabel = idna.encode(domain).decode()
    except Exception:
        domain_alabel = domain  # Fallback – let DNS resolver handle errors

    def _query_and_parse(query_name: str, filter_by_protocol: bool = True) -> Tuple[dict, int]:
        """Query a specific FQDN and parse the result."""
        txt_records, ttl = _query_txt_record(query_name, timeout)

        last_error: AidError | None = None
        valid_records: list[dict] = []
        for txt in txt_records:
            try:
                record = parse(txt)
                # If protocol filtering is enabled and a protocol is specified, ensure the record matches
                if filter_by_protocol and protocol and record.get("proto") != protocol:
                    last_error = AidError("ERR_UNSUPPORTED_PROTO", f"Record found, but protocol does not match requested '{protocol}'")
                    continue
                valid_records.append(record)
            except AidError as exc:
                # Save and try the next TXT string (if multiple records exist)
                last_error = exc
                continue

        if len(valid_records) == 1:
            return valid_records[0], ttl
        if len(valid_records) > 1:
            raise AidError(
                "ERR_INVALID_TXT",
                f"Multiple valid AID records found for {query_name}; publish exactly one valid record per queried DNS name",
            )

        # If we got here, either no records or all invalid
        if last_error is not None:
            raise last_error
        raise AidError("ERR_NO_RECORD", f"No valid _agent TXT record found for {query_name}")

    def _fetch_well_known_json(host: str, timeout_s: float) -> dict:
        import json, urllib.request, urllib.error

        # Disallow redirects explicitly per guard (no redirects)
        class _NoRedirect(urllib.request.HTTPRedirectHandler):  # type: ignore[attr-defined]
            def redirect_request(self, req, fp, code, msg, headers, newurl):  # pragma: no cover
                return None

        url = f"https://{host}/.well-known/agent"
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        opener = urllib.request.build_opener(_NoRedirect())
        try:
            # Use custom opener to avoid following redirects
            with opener.open(req, timeout=timeout_s) as resp:  # nosec B310
                if resp.status != 200:
                    raise AidError("ERR_FALLBACK_FAILED", f"Well-known HTTP {resp.status}")
                ctype = (resp.headers.get("Content-Type") or "").lower()
                if not ctype.startswith("application/json"):
                    raise AidError("ERR_FALLBACK_FAILED", "Invalid content-type for well-known (expected application/json)")
                data = resp.read()
                if len(data) > 64 * 1024:
                    raise AidError("ERR_FALLBACK_FAILED", "Well-known response too large (>64KB)")
                try:
                    doc = json.loads(data.decode("utf-8"))
                except Exception:
                    raise AidError("ERR_FALLBACK_FAILED", "Invalid JSON in well-known response") from None
                if not isinstance(doc, dict):
                    raise AidError("ERR_FALLBACK_FAILED", "Well-known JSON must be an object")
                return doc
        except AidError:
            raise
        except (urllib.error.URLError, urllib.error.HTTPError) as exc:
            raise AidError("ERR_FALLBACK_FAILED", str(exc)) from None

    def _canonicalize_well_known(doc: dict) -> dict:
        # Accept aliases the same as TXT parsing
        def _get(k: str):
            v = doc.get(k)
            return v.strip() if isinstance(v, str) else None

        raw: _parser.RawAidRecord = {}
        if (v := _get("v")):
            raw["v"] = v
        if (u := _get("uri")) or (u := _get("u")):
            raw["uri"] = u
        if (p := _get("proto")) or (p := _get("p")):
            raw["proto"] = p
        if (a := _get("auth")) or (a := _get("a")):
            raw["auth"] = a
        if (s := _get("desc")) or (s := _get("s")):
            raw["desc"] = s
        if (d := _get("docs")) or (d := _get("d")):
            raw["docs"] = d
        if (e := _get("dep")) or (e := _get("e")):
            raw["dep"] = e
        if (k := _get("pka")) or (k := _get("k")):
            raw["pka"] = k
        if (i := _get("kid")) or (i := _get("i")):
            raw["kid"] = i
        return _parser.validate_record(raw)

    # --- Discovery Logic ---
    # 1. Start with the base domain query
    base_fqdn = f"{DNS_SUBDOMAIN}.{domain_alabel}".rstrip(".")
    try:
        record, ttl = _query_and_parse(base_fqdn, filter_by_protocol=True)
        # If no specific protocol is requested, or if the found record matches, we're done.
        if not protocol or record.get("proto") == protocol:
            return record, ttl
    except AidError as e:
        # If the base lookup fails with anything other than no record, we might still fallback.
        # But if it's a critical error, we shouldn't continue to protocol-specific lookups.
        if e.error_code not in ("ERR_NO_RECORD", "ERR_UNSUPPORTED_PROTO"):
            # Re-raise unless we can fallback later
            if not (well_known_fallback and e.error_code == "ERR_DNS_LOOKUP_FAILED"):
                 raise

    # 2. If a specific protocol was requested and the base record didn't match (or was missing),
    # try the protocol-specific subdomains.
    if protocol:
        # a) underscore form: _agent._<proto>.<domain>
        proto_underscore = f"{DNS_SUBDOMAIN}._{protocol}.{domain_alabel}".rstrip(".")
        try:
            return _query_and_parse(proto_underscore, filter_by_protocol=True)
        except AidError as e:
            if getattr(e, "error_code", None) != "ERR_NO_RECORD":
                 raise

        # b) non-underscore form (as a fallback for older specs or misconfigurations)
        proto_plain = f"{DNS_SUBDOMAIN}.{protocol}.{domain_alabel}".rstrip(".")
        try:
            return _query_and_parse(proto_plain, filter_by_protocol=True)
        except AidError as e:
            if getattr(e, "error_code", None) != "ERR_NO_RECORD":
                 raise

    # 3. If all DNS lookups fail, handle the final fallback or error state.
    try:
        # This will re-query the base and fail with a clear error if nothing is found.
        # Or, it will trigger the .well-known fallback if applicable.
        # Per spec: when falling back to base record, do NOT filter by protocol to maintain compatibility
        return _query_and_parse(base_fqdn, filter_by_protocol=False)
    except AidError as exc:
        if well_known_fallback and exc.error_code in ("ERR_NO_RECORD", "ERR_DNS_LOOKUP_FAILED"):
            # Attempt .well-known fallback
            doc = _fetch_well_known_json(domain_alabel, well_known_timeout)
            record = _canonicalize_well_known(doc)
            # Perform PKA handshake if present
            if record.get("pka"):
                if perform_pka_handshake is None:
                    raise AidError("ERR_SECURITY", "PKA handshake not supported in this environment")
                perform_pka_handshake(record["uri"], record["pka"], record.get("kid") or "", timeout=well_known_timeout)
            return record, DNS_TTL_MIN
        raise
