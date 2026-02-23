using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;

namespace AidDiscovery;

public static class Aid
{
    private static readonly HashSet<string> ProtocolTokens =
        typeof(Constants)
            .GetFields(BindingFlags.Public | BindingFlags.Static)
            .Where(f => f.IsLiteral && !f.IsInitOnly && f.FieldType == typeof(string) && f.Name.StartsWith("PROTO_"))
            .Select(f => (string)f.GetRawConstantValue()!)
            .ToHashSet(StringComparer.Ordinal);

    private static readonly HashSet<string> AuthTokens =
        typeof(Constants)
            .GetFields(BindingFlags.Public | BindingFlags.Static)
            .Where(f => f.IsLiteral && !f.IsInitOnly && f.FieldType == typeof(string) && f.Name.StartsWith("AUTH_"))
            .Select(f => (string)f.GetRawConstantValue()!)
            .ToHashSet(StringComparer.Ordinal);

    private static readonly HashSet<string> LocalUriSchemes = new(Constants.LocalUriSchemes, StringComparer.Ordinal);

    public static AidRecord Parse(string txt)
    {
        if (txt is null) throw new ArgumentNullException(nameof(txt));
        var raw = ParseRaw(txt);
        return ValidateRecord(raw);
    }

    private static Dictionary<string, string> ParseRaw(string txt)
    {
        var map = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var pair in txt.Split(';'))
        {
            var p = pair.Trim();
            if (p.Length == 0) continue;
            var idx = p.IndexOf('=');
            if (idx <= 0 || idx == p.Length - 1)
            {
                throw new AidError(nameof(Constants.ERR_INVALID_TXT), $"Invalid key-value pair: {p}");
            }
            var key = p[..idx].Trim().ToLowerInvariant();
            var value = p[(idx + 1)..].Trim();
            if (key.Length == 0 || value.Length == 0)
            {
                throw new AidError(nameof(Constants.ERR_INVALID_TXT), $"Empty key or value in pair: {p}");
            }
            if (map.ContainsKey(key))
            {
                throw new AidError(nameof(Constants.ERR_INVALID_TXT), $"Duplicate key: {key}");
            }
            map[key] = value;
        }
        return map;
    }

    private static AidRecord ValidateRecord(Dictionary<string, string> raw)
    {
        // Canonical wire key is `v`, but we accept `version` for compatibility.
        var hasV = raw.TryGetValue("v", out var v);
        var hasVersion = raw.TryGetValue("version", out var version);
        if (hasV && hasVersion)
        {
            throw new AidError(nameof(Constants.ERR_INVALID_TXT), "Cannot specify both \"version\" and \"v\" fields");
        }
        if (!hasV && hasVersion)
        {
            v = version;
            hasV = true;
        }
        if (!hasV)
        {
            throw new AidError(nameof(Constants.ERR_INVALID_TXT), "Missing required field: v");
        }
        if (!string.Equals(v, Constants.SpecVersion, StringComparison.Ordinal))
        {
            throw new AidError(nameof(Constants.ERR_INVALID_TXT), $"Unsupported version: {v}. Expected: {Constants.SpecVersion}");
        }

        // Alias duplication checks
        var aliasPairs = new (string full, string alias)[] { ("proto","p"), ("uri","u"), ("auth","a"), ("desc","s"), ("docs","d"), ("dep","e"), ("pka","k"), ("kid","i") };
        foreach (var (full, alias) in aliasPairs)
        {
            if (raw.ContainsKey(full) && raw.ContainsKey(alias))
            {
                throw new AidError(nameof(Constants.ERR_INVALID_TXT), $"Cannot specify both \"{full}\" and \"{alias}\"");
            }
        }

        if (!raw.TryGetValue("uri", out var uri))
        {
            if (!raw.TryGetValue("u", out uri))
                throw new AidError(nameof(Constants.ERR_INVALID_TXT), "Missing required field: uri");
        }

        var hasProto = raw.TryGetValue("proto", out var protoVal);
        var hasP = raw.TryGetValue("p", out var pVal);
        if (hasProto && hasP)
        {
            throw new AidError(nameof(Constants.ERR_INVALID_TXT), "Cannot specify both \"proto\" and \"p\" fields");
        }
        if (!hasProto && !hasP)
        {
            throw new AidError(nameof(Constants.ERR_INVALID_TXT), "Missing required field: proto (or p)");
        }
        var proto = hasProto ? protoVal : pVal;

        if (!ProtocolTokens.Contains(proto))
        {
            throw new AidError(nameof(Constants.ERR_UNSUPPORTED_PROTO), $"Unsupported protocol: {proto}");
        }

        var auth = raw.TryGetValue("auth", out var authFull) ? authFull : (raw.TryGetValue("a", out var authAlias) ? authAlias : null);
        if (auth is not null)
        {
            if (!AuthTokens.Contains(auth))
            {
                throw new AidError(nameof(Constants.ERR_INVALID_TXT), $"Invalid auth token: {auth}");
            }
        }

        var desc = raw.TryGetValue("desc", out var descFull) ? descFull : (raw.TryGetValue("s", out var descAlias) ? descAlias : null);
        if (desc is not null)
        {
            if (Encoding.UTF8.GetByteCount(desc) > 60)
            {
                throw new AidError(nameof(Constants.ERR_INVALID_TXT), "Description field must be ≤ 60 UTF-8 bytes");
            }
        }

        // docs (https URL)
        var docs = raw.TryGetValue("docs", out var docsFull) ? docsFull : (raw.TryGetValue("d", out var docsAlias) ? docsAlias : null);
        if (docs is not null)
        {
            if (!docs.StartsWith("https://", StringComparison.Ordinal))
            {
                throw new AidError(nameof(Constants.ERR_INVALID_TXT), "docs MUST be an absolute https:// URL");
            }
            if (!Uri.TryCreate(docs, UriKind.Absolute, out var du) || !string.Equals(du.Scheme, Uri.UriSchemeHttps, StringComparison.Ordinal))
            {
                throw new AidError(nameof(Constants.ERR_INVALID_TXT), $"Invalid docs URL: {docs}");
            }
        }

        // dep (ISO 8601 Z)
        var dep = raw.TryGetValue("dep", out var depFull) ? depFull : (raw.TryGetValue("e", out var depAlias) ? depAlias : null);
        if (dep is not null)
        {
            if (!dep.EndsWith("Z", StringComparison.Ordinal))
            {
                throw new AidError(nameof(Constants.ERR_INVALID_TXT), "dep MUST be an ISO 8601 UTC timestamp (e.g., 2026-01-01T00:00:00Z)");
            }
            if (!DateTime.TryParseExact(dep, "yyyy-MM-dd'T'HH:mm:ss'Z'", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AdjustToUniversal, out _))
            {
                throw new AidError(nameof(Constants.ERR_INVALID_TXT), "dep MUST be an ISO 8601 UTC timestamp (e.g., 2026-01-01T00:00:00Z)");
            }
        }

        // URI validation
        if (proto == "local")
        {
            if (!IsValidLocalUri(uri))
            {
                throw new AidError(nameof(Constants.ERR_INVALID_TXT), $"Invalid URI scheme for local protocol. Must be one of: {string.Join(", ", LocalUriSchemes)}");
            }
        }
        else if (proto == "zeroconf")
        {
            if (!uri.StartsWith("zeroconf:", StringComparison.Ordinal))
            {
                throw new AidError(nameof(Constants.ERR_INVALID_TXT), "Invalid URI scheme for 'zeroconf'. MUST be 'zeroconf:'");
            }
        }
        else if (proto == "websocket")
        {
            if (!uri.StartsWith("wss://", StringComparison.Ordinal))
            {
                throw new AidError(nameof(Constants.ERR_INVALID_TXT), "Invalid URI scheme for 'websocket'. MUST be 'wss:'");
            }
            if (!Uri.TryCreate(uri, UriKind.Absolute, out var wu) || !string.Equals(wu.Scheme, "wss", StringComparison.Ordinal))
            {
                throw new AidError(nameof(Constants.ERR_INVALID_TXT), $"Invalid URI format: {uri}");
            }
        }
        else
        {
            if (!uri.StartsWith("https://", StringComparison.Ordinal))
            {
                throw new AidError(nameof(Constants.ERR_INVALID_TXT), $"Invalid URI scheme for remote protocol '{proto}'. MUST be 'https:'");
            }
            if (uri.StartsWith("https://", StringComparison.Ordinal) && !IsValidHttpsUri(uri))
            {
                throw new AidError(nameof(Constants.ERR_INVALID_TXT), $"Invalid URI format: {uri}");
            }
        }

        var pka = raw.TryGetValue("pka", out var kfull) ? kfull : (raw.TryGetValue("k", out var kalias) ? kalias : null);
        var kid = raw.TryGetValue("kid", out var ifull) ? ifull : (raw.TryGetValue("i", out var ialias) ? ialias : null);
        if (pka is not null && kid is null)
        {
            throw new AidError(nameof(Constants.ERR_INVALID_TXT), "kid is required when pka is present");
        }

        return new AidRecord(
            v: Constants.SpecVersion,
            uri: uri,
            proto: proto,
            auth: auth,
            desc: desc,
            docs: docs,
            dep: dep,
            pka: pka,
            kid: kid
        );
    }

    private static bool IsValidLocalUri(string uri)
    {
        var match = Regex.Match(uri, "^(?<scheme>[a-zA-Z][a-zA-Z0-9+.-]*):");
        if (!match.Success) return false;
        var scheme = match.Groups["scheme"].Value;
        return LocalUriSchemes.Contains(scheme);
    }

    private static bool IsValidHttpsUri(string uri)
    {
        if (!Uri.TryCreate(uri, UriKind.Absolute, out var u)) return false;
        if (!string.Equals(u.Scheme, Uri.UriSchemeHttps, StringComparison.Ordinal)) return false;
        if (string.IsNullOrEmpty(u.Host)) return false;
        return true;
    }
}
