using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;

namespace AidDiscovery;

public sealed class DiscoveryOptions
{
    public string? Protocol;
    public TimeSpan Timeout = TimeSpan.FromSeconds(5);
    public bool WellKnownFallback = true;
    public TimeSpan WellKnownTimeout = TimeSpan.FromSeconds(2);
}

public sealed class DiscoveryResult
{
    public required AidRecord Record { get; init; }
    public required int Ttl { get; init; }
    public required string QueryName { get; init; }
    public bool DomainBound { get; init; }
}

public static class Discovery
{
    // Single shared client reused across all DoH lookups. Creating/disposing an HttpClient
    // per call leaves connections in TIME_WAIT and can exhaust ephemeral ports under load.
    // Per-request timeouts are applied via a linked CancellationTokenSource rather than
    // HttpClient.Timeout so the shared instance stays usable across differing timeouts.
    private static readonly HttpClient SharedClient = new(new SocketsHttpHandler
    {
        AllowAutoRedirect = false,
        PooledConnectionLifetime = TimeSpan.FromMinutes(2),
    });

    private static string ToALabel(string domain)
    {
        try { return new IdnMapping().GetAscii(domain); }
        catch { return domain; }
    }

    internal static IReadOnlyList<string> QueryNames(string alabel, string? protocol)
    {
        var names = new List<string>();
        if (!string.IsNullOrEmpty(protocol))
        {
            names.Add($"{Constants.DnsSubdomain}._{protocol}.{alabel}".TrimEnd('.'));
        }
        names.Add($"{Constants.DnsSubdomain}.{alabel}".TrimEnd('.'));
        return names;
    }

    private static async Task<(List<string> txts, int ttl)> QueryTxtDoHAsync(string fqdn, TimeSpan timeout, CancellationToken cancellationToken)
    {
        // Cloudflare DoH JSON endpoint
        var url = $"https://cloudflare-dns.com/dns-query?name={Uri.EscapeDataString(fqdn)}&type=TXT";
        using var timeoutCts = new CancellationTokenSource(timeout);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        req.Headers.TryAddWithoutValidation("Accept", "application/dns-json");
        using var res = await SharedClient.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, linked.Token).ConfigureAwait(false);
        if (!res.IsSuccessStatusCode)
            throw new AidError(nameof(Constants.ERR_DNS_LOOKUP_FAILED), $"DoH HTTP {(int)res.StatusCode}");
        using var doc = await JsonDocument.ParseAsync(await res.Content.ReadAsStreamAsync(linked.Token).ConfigureAwait(false), cancellationToken: linked.Token).ConfigureAwait(false);
        var root = doc.RootElement;
        if (root.TryGetProperty("Answer", out var answer) && answer.ValueKind == JsonValueKind.Array)
        {
            var txts = new List<string>();
            int ttl = 0;
            foreach (var a in answer.EnumerateArray())
            {
                if (a.TryGetProperty("data", out var dataEl))
                {
                    var data = dataEl.GetString() ?? string.Empty;
                    // Strip surrounding quotes from TXT payload if present
                    if (data.Length >= 2 && data[0] == '"' && data[^1] == '"')
                    {
                        data = data.Substring(1, data.Length - 2);
                    }
                    txts.Add(data);
                    if (ttl == 0 && a.TryGetProperty("TTL", out var ttlEl) && ttlEl.TryGetInt32(out var t)) ttl = t;
                }
            }
            if (txts.Count > 0) return (txts, ttl);
        }
        // Treat as no-record
        throw new AidError(nameof(Constants.ERR_NO_RECORD), $"No TXT answers for {fqdn}");
    }

    private static async Task<(AidRecord, bool)> ParseSingleValid(IEnumerable<string> txts, TimeSpan timeout, string queryName, string? queriedDomain = null, CancellationToken cancellationToken = default)
    {
        AidError? last = null;
        var byVersion = new Dictionary<string, List<AidRecord>>(StringComparer.Ordinal)
        {
            [Constants.SpecVersionV2] = new(),
            [Constants.SpecVersionV1] = new(),
        };
        foreach (var txt in txts)
        {
            try
            {
                var rec = Aid.Parse(txt);
                if (byVersion.TryGetValue(rec.V, out var records))
                {
                    records.Add(rec);
                }
            }
            catch (AidError e) { last = e; }
        }
        foreach (var version in new[] { Constants.SpecVersionV2, Constants.SpecVersionV1 })
        {
            var records = byVersion[version];
            if (records.Count == 0)
            {
                continue;
            }
            if (records.Count > 1)
            {
                throw new AidError(
                    nameof(Constants.ERR_INVALID_TXT),
                    $"Multiple valid {version} AID records found for {queryName}; publish exactly one valid record per queried DNS name"
                );
            }
            var valid = records[0];
            EnforceDepExpiry(valid, queryName);
            bool domainBound = false;
            if (!string.IsNullOrEmpty(valid.Pka))
            {
                domainBound = await Pka.PerformHandshakeAsync(valid.Uri, valid.Pka!, valid.Kid ?? string.Empty, timeout, domain: queriedDomain, cancellationToken: cancellationToken).ConfigureAwait(false);
            }
            return (valid, domainBound);
        }
        throw last ?? new AidError(nameof(Constants.ERR_NO_RECORD), "No valid AID record in TXT answers");
    }

    // Mirrors the TS client: a record whose `dep` (deprecation) date is in the past is rejected
    // as ERR_INVALID_TXT; a future-dated `dep` is a non-fatal warning. Unparseable dates are
    // ignored here (format is already validated during Aid.Parse).
    internal static void EnforceDepExpiry(AidRecord record, string queryName)
    {
        if (string.IsNullOrEmpty(record.Dep))
        {
            return;
        }
        if (!DateTimeOffset.TryParse(record.Dep, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var depDate))
        {
            return;
        }
        if (depDate < DateTimeOffset.UtcNow)
        {
            throw new AidError(nameof(Constants.ERR_INVALID_TXT), $"Record for {queryName} was deprecated on {record.Dep}");
        }
        Console.Error.WriteLine($"[AID] WARNING: Record for {queryName} is scheduled for deprecation on {record.Dep}");
    }

    public static async Task<DiscoveryResult> DiscoverAsync(string domain, DiscoveryOptions? options = null, CancellationToken cancellationToken = default)
    {
        options ??= new DiscoveryOptions();
        var alabel = ToALabel(domain);

        var names = QueryNames(alabel, options.Protocol);

        AidError? last = null;
        foreach (var name in names)
        {
            try
            {
                var (txts, ttl) = await QueryTxtDoHAsync(name, options.Timeout, cancellationToken).ConfigureAwait(false);
                var (rec, domainBound) = await ParseSingleValid(txts, options.Timeout, name, alabel, cancellationToken).ConfigureAwait(false);
                return new DiscoveryResult { Record = rec, Ttl = ttl, QueryName = name, DomainBound = domainBound };
            }
            catch (AidError e)
            {
                last = e;
                if (e.ErrorCode != nameof(Constants.ERR_NO_RECORD)) break; // stop on non-NO_RECORD
                continue;
            }
        }

        if (options.WellKnownFallback && last is not null && (last.ErrorCode == nameof(Constants.ERR_NO_RECORD) || last.ErrorCode == nameof(Constants.ERR_DNS_LOOKUP_FAILED)))
        {
            var (rec, domainBound) = await WellKnown.FetchAsync(alabel, options.WellKnownTimeout, queriedDomain: alabel, cancellationToken: cancellationToken).ConfigureAwait(false);
            return new DiscoveryResult { Record = rec, Ttl = Constants.DnsTtlMin, QueryName = $"{Constants.DnsSubdomain}.{alabel}", DomainBound = domainBound };
        }
        throw last ?? new AidError(nameof(Constants.ERR_DNS_LOOKUP_FAILED), "DNS query failed");
    }
}
