using System.Net.Http.Json;
using System.Text.Json;
using System.Text;

namespace AidDiscovery;

public static class WellKnown
{
    private static string CanonicalizeToTxt(JsonElement obj)
    {
        static string? GetStr(JsonElement root, string k)
            => root.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        // Canonical TXT emission uses short keys for byte budget.
        // Parsing still accepts long keys (`version`, `proto`, etc.) for compatibility.
        var v = GetStr(obj, "v") ?? GetStr(obj, "version");
        var uri = GetStr(obj, "uri") ?? GetStr(obj, "u");
        var proto = GetStr(obj, "proto") ?? GetStr(obj, "p");
        var auth = GetStr(obj, "auth") ?? GetStr(obj, "a");
        var desc = GetStr(obj, "desc") ?? GetStr(obj, "s");
        var docs = GetStr(obj, "docs") ?? GetStr(obj, "d");
        var dep = GetStr(obj, "dep") ?? GetStr(obj, "e");
        var pka = GetStr(obj, "pka") ?? GetStr(obj, "k");
        var kid = GetStr(obj, "kid") ?? GetStr(obj, "i");
        var sb = new StringBuilder();
        if (v != null) sb.Append($"v={v};");
        if (uri != null) sb.Append($"u={uri};");
        if (proto != null) sb.Append($"p={proto};");
        if (!string.IsNullOrEmpty(auth)) sb.Append($"a={auth};");
        if (!string.IsNullOrEmpty(desc)) sb.Append($"s={desc};");
        if (!string.IsNullOrEmpty(docs)) sb.Append($"d={docs};");
        if (!string.IsNullOrEmpty(dep)) sb.Append($"e={dep};");
        if (!string.IsNullOrEmpty(pka)) sb.Append($"k={pka};");
        if (!string.IsNullOrEmpty(kid)) sb.Append($"i={kid};");
        return sb.ToString().TrimEnd(';');
    }

    public static async Task<AidRecord> FetchAsync(string domain, TimeSpan timeout, bool allowInsecure = false)
    {
        var scheme = allowInsecure ? "http" : "https";
        var url = $"{scheme}://{domain}/.well-known/agent";
        using var http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = timeout };
        using var res = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead).ConfigureAwait(false);
        if (!res.IsSuccessStatusCode) throw new AidError(nameof(Constants.ERR_FALLBACK_FAILED), $"Well-known HTTP {(int)res.StatusCode}");
        var ct = res.Content.Headers.ContentType?.MediaType?.ToLowerInvariant() ?? string.Empty;
        if (!ct.StartsWith("application/json")) throw new AidError(nameof(Constants.ERR_FALLBACK_FAILED), "Invalid content-type for well-known (expected application/json)");
        var data = await res.Content.ReadAsByteArrayAsync().ConfigureAwait(false);
        if (data.Length > 64 * 1024) throw new AidError(nameof(Constants.ERR_FALLBACK_FAILED), "Well-known response too large (>64KB)");
        JsonDocument doc;
        try { doc = JsonDocument.Parse(data); }
        catch { throw new AidError(nameof(Constants.ERR_FALLBACK_FAILED), "Invalid JSON in well-known response"); }
        if (doc.RootElement.ValueKind != JsonValueKind.Object) throw new AidError(nameof(Constants.ERR_FALLBACK_FAILED), "Well-known JSON must be an object");
        string txt = CanonicalizeToTxt(doc.RootElement);
        AidRecord record;
        try
        {
            record = Aid.Parse(txt);
        }
        catch (AidError) when (allowInsecure)
        {
            // Narrow relaxation: http only for loopback + remote protocols
            var host = domain;
            bool isLoopback = host.Equals("localhost", StringComparison.OrdinalIgnoreCase) || host.StartsWith("127.0.0.1") || host.Equals("::1", StringComparison.Ordinal);
            string? uri = doc.RootElement.TryGetProperty("uri", out var uEl) && uEl.ValueKind == JsonValueKind.String ? uEl.GetString() : (doc.RootElement.TryGetProperty("u", out var u2El) && u2El.ValueKind == JsonValueKind.String ? u2El.GetString() : null);
            string? proto = doc.RootElement.TryGetProperty("proto", out var pEl) && pEl.ValueKind == JsonValueKind.String ? pEl.GetString() : (doc.RootElement.TryGetProperty("p", out var p2El) && p2El.ValueKind == JsonValueKind.String ? p2El.GetString() : null);
            bool isHttpRemote = uri is not null && uri.StartsWith("http://", StringComparison.OrdinalIgnoreCase);
            bool isRemoteProto = proto is not null && !(proto == "local" || proto == "zeroconf" || proto == "websocket");
            if (!(isLoopback && isHttpRemote && isRemoteProto)) throw;
            // Validate other fields by upgrading scheme just for validation
            string txtHttps = txt.Replace("uri=http://", "uri=https://").Replace("u=http://", "u=https://");
            var validated = Aid.Parse(txtHttps);
            // Restore http URI in the resulting record
            record = new AidRecord(validated.V, uri!, validated.Proto, validated.Auth, validated.Desc, validated.Docs, validated.Dep, validated.Pka, validated.Kid);
        }
        if (record.Pka is not null)
        {
            await Pka.PerformHandshakeAsync(record.Uri, record.Pka, record.Kid ?? string.Empty, timeout).ConfigureAwait(false);
        }
        return record;
    }
}
