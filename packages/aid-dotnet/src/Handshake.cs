using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using NSec.Cryptography;

namespace AidDiscovery;

public static class Pka
{
    internal static Action<byte[]> FillRandomBytesForTesting { get; set; } = bytes => RandomNumberGenerator.Fill(bytes);
    internal static Func<long> NowUnixForTesting { get; set; } = () => DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    internal static Func<HttpRequestMessage, TimeSpan, Task<HttpResponseMessage>> SendAsyncForTesting { get; set; } = SendWithDefaultClientAsync;

    private static string AsciiToLower(string s)
    {
        return string.Create(s.Length, s, (span, state) =>
        {
            for (int i = 0; i < span.Length; i++)
            {
                char c = state[i];
                span[i] = c >= 'A' && c <= 'Z' ? (char)(c + ('a' - 'A')) : c;
            }
        });
    }

    private static string CanonicalizeAidDomain(string domain)
    {
        var value = AsciiToLower(domain.Trim());
        // Strip exactly one trailing dot
        if (value.EndsWith(".", StringComparison.Ordinal))
        {
            value = value[..^1];
        }
        if (value.Length == 0 || !Regex.IsMatch(value, @"^[a-z0-9.:\[\]_-]+$"))
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "Invalid AID-Domain value");
        }
        return value;
    }

    private static async Task<HttpResponseMessage> SendWithDefaultClientAsync(HttpRequestMessage request, TimeSpan timeout)
    {
        using var http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = timeout };
        return await http.SendAsync(request).ConfigureAwait(false);
    }

    private static byte[] MultibaseDecode(string s)
    {
        if (string.IsNullOrEmpty(s)) throw new AidError(nameof(Constants.ERR_SECURITY), "Empty PKA");
        if (s[0] != 'z') throw new AidError(nameof(Constants.ERR_SECURITY), "Unsupported multibase prefix");
        return Base58.Decode(s.Substring(1));
    }

    private static string Base64UrlEncode(byte[] data)
    {
        return Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static string GetHeader(HttpResponseMessage res, string name)
    {
        if (res.Headers.TryGetValues(name, out var values))
        {
            return string.Join(", ", values);
        }
        if (res.Content is not null && res.Content.Headers.TryGetValues(name, out var contentValues))
        {
            return string.Join(", ", contentValues);
        }
        return string.Empty;
    }

    private static bool TimingSafeEqualString(string a, string b)
    {
        return a.Length == b.Length &&
            CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(a), Encoding.UTF8.GetBytes(b));
    }

    private static (string[] covered, long created, string keyidRaw, string keyid, string alg, byte[] signature, string? responseDate) ParseSignatureHeaders(HttpResponseMessage res)
    {
        var sigInput = GetHeader(res, "Signature-Input");
        var sig = GetHeader(res, "Signature");
        if (string.IsNullOrEmpty(sigInput) || string.IsNullOrEmpty(sig)) throw new AidError(nameof(Constants.ERR_SECURITY), "Missing signature headers");

        var mInside = Regex.Match(sigInput, "sig=\\(\\s*([^)]+?)\\s*\\)", RegexOptions.IgnoreCase);
        if (!mInside.Success) throw new AidError(nameof(Constants.ERR_SECURITY), "Invalid Signature-Input");
        var items = new List<string>();
        var m = Regex.Matches(mInside.Groups[1].Value, "\"([^\"]+)\"");
        foreach (Match mm in m) items.Add(mm.Groups[1].Value);
        if (items.Count == 0) throw new AidError(nameof(Constants.ERR_SECURITY), "Invalid Signature-Input");

        var required = new List<string> { "aid-challenge", "@method", "@target-uri", "host", "date" };
        if (items.Count != required.Count)
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "Signature-Input must cover required fields");
        }

        var lower = items.Select(AsciiToLower).ToList();
        lower.Sort(StringComparer.Ordinal);
        required.Sort(StringComparer.Ordinal);

        var areEqual = true;
        for (int i = 0; i < required.Count; i++)
        {
            if (!TimingSafeEqualString(lower[i], required[i]))
            {
                areEqual = false;
            }
        }
        if (!areEqual)
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "Signature-Input must cover required fields");
        }

        var mCreated = Regex.Match(sigInput, @"(?:^|;)\s*created=(\d+)");
        var mKeyid = Regex.Match(sigInput, @"(?:^|;)\s*keyid=([^;\s]+)");
        var mAlg = Regex.Match(sigInput, @"(?:^|;)\s*alg=""([^\""]+)""");
        if (!mCreated.Success || !mKeyid.Success || !mAlg.Success)
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "Invalid Signature-Input");
        }
        var created = long.Parse(mCreated.Groups[1].Value);
        var keyidRaw = mKeyid.Groups[1].Value;
        var keyid = keyidRaw.Trim('"');
        var alg = AsciiToLower(mAlg.Groups[1].Value);

        var mSig = Regex.Match(sig, @"sig\s*=\s*:\s*([^:]+)\s*:", RegexOptions.IgnoreCase);
        if (!mSig.Success) throw new AidError(nameof(Constants.ERR_SECURITY), "Invalid Signature header");
        var signature = Convert.FromBase64String(mSig.Groups[1].Value);
        var responseDate = GetHeader(res, "Date");
        return (items.ToArray(), created, keyidRaw, keyid, alg, signature, string.IsNullOrEmpty(responseDate) ? null : responseDate);
    }

    private static byte[] BuildSignatureBase(string[] covered, long created, string keyidRaw, string alg, string method, string targetUri, string host, string date, string challenge)
    {
        var lines = new List<string>();
        foreach (var item in covered)
        {
            var lower = AsciiToLower(item);
            var appended = false;
            if (TimingSafeEqualString(lower, "aid-challenge"))
            {
                lines.Add($"\"AID-Challenge\": {challenge}");
                appended = true;
            }
            if (TimingSafeEqualString(lower, "@method"))
            {
                lines.Add($"\"@method\": {method}");
                appended = true;
            }
            if (TimingSafeEqualString(lower, "@target-uri"))
            {
                lines.Add($"\"@target-uri\": {targetUri}");
                appended = true;
            }
            if (TimingSafeEqualString(lower, "host"))
            {
                lines.Add($"\"host\": {host}");
                appended = true;
            }
            if (TimingSafeEqualString(lower, "date"))
            {
                lines.Add($"\"date\": {date}");
                appended = true;
            }
            if (!appended)
            {
                throw new AidError(nameof(Constants.ERR_SECURITY), $"Unsupported covered field: {item}");
            }
        }
        var quoted = string.Join(' ', covered.Select(c => $"\"{c}\""));
        var paramsStr = $"({quoted});created={created};keyid={keyidRaw};alg=\"{alg}\"";
        lines.Add($"\"@signature-params\": {paramsStr}");
        return Encoding.UTF8.GetBytes(string.Join('\n', lines));
    }

    public static async Task<bool> PerformHandshakeAsync(string uri, string pka, string kid, TimeSpan timeout, string? domain = null)
    {
        if (string.IsNullOrEmpty(kid))
        {
            return await PerformV2HandshakeAsync(uri, pka, timeout, domain).ConfigureAwait(false);
        }
        await PerformV1HandshakeAsync(uri, pka, kid, timeout).ConfigureAwait(false);
        return false;
    }

    private static async Task PerformV1HandshakeAsync(string uri, string pka, string kid, TimeSpan timeout)
    {
        var u = new Uri(uri);
        var challengeBytes = new byte[32];
        FillRandomBytesForTesting(challengeBytes);
        var challenge = Base64UrlEncode(challengeBytes);
        var date = DateTimeOffset.UtcNow.ToString("r");
        using var req = new HttpRequestMessage(HttpMethod.Get, uri);
        req.Headers.TryAddWithoutValidation("AID-Challenge", challenge);
        req.Headers.TryAddWithoutValidation("Date", date);
        using var res = await SendAsyncForTesting(req, timeout).ConfigureAwait(false);
        if (!res.IsSuccessStatusCode) throw new AidError(nameof(Constants.ERR_SECURITY), $"Handshake HTTP {(int)res.StatusCode}");

        var (covered, created, keyidRaw, keyidNorm, alg, signature, respDate) = ParseSignatureHeaders(res);
        var now = NowUnixForTesting();
        if (Math.Abs(now - created) > 300) throw new AidError(nameof(Constants.ERR_SECURITY), "Signature created timestamp outside acceptance window");
        if (respDate is not null)
        {
            if (!DateTimeOffset.TryParse(respDate, out var dt)) throw new AidError(nameof(Constants.ERR_SECURITY), "Invalid Date header");
            var epoch = dt.ToUnixTimeSeconds();
            if (Math.Abs(now - epoch) > 300) throw new AidError(nameof(Constants.ERR_SECURITY), "HTTP Date header outside acceptance window");
        }
        if (!TimingSafeEqualString(keyidNorm, kid))
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "Signature keyid mismatch");
        }
        if (!TimingSafeEqualString(alg, "ed25519"))
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "Unsupported signature algorithm");
        }

        var baseBytes = BuildSignatureBase(covered, created, keyidRaw, alg, "GET", uri, u.Authority, respDate ?? date, challenge);
        var pub = MultibaseDecode(pka);
        if (pub.Length != 32) throw new AidError(nameof(Constants.ERR_SECURITY), "Invalid PKA length");
        VerifyEd25519(pub, baseBytes, signature);
    }

    private static async Task<bool> PerformV2HandshakeAsync(string uri, string pka, TimeSpan timeout, string? domain = null)
    {
        var (pub, expectedKeyid) = DeriveAid2KeyMaterial(pka);
        var requestUri = NormalizeRequestUri(uri);
        var authority = RequestAuthority(requestUri);
        var nonceBytes = new byte[32];
        FillRandomBytesForTesting(nonceBytes);
        var nonce = Base64UrlEncode(nonceBytes);

        // Canonicalize domain ONCE; thread the SAME value to header + sig base
        string? canonicalDomain = domain is not null ? CanonicalizeAidDomain(domain) : null;
        var requestDomainBound = canonicalDomain is not null;

        using var req = new HttpRequestMessage(HttpMethod.Get, requestUri);
        req.Headers.TryAddWithoutValidation("Accept-Signature", BuildAcceptSignatureV2(expectedKeyid, nonce, requestDomainBound));
        req.Headers.CacheControl = new CacheControlHeaderValue { NoStore = true };
        if (canonicalDomain is not null)
        {
            req.Headers.TryAddWithoutValidation("AID-Domain", canonicalDomain);
        }
        using var res = await SendAsyncForTesting(req, timeout).ConfigureAwait(false);

        var status = (int)res.StatusCode;
        if (status >= 300 && status < 400)
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "PKA redirects are not allowed");
        }
        if (!HasNoStoreDirective(GetHeader(res, "Cache-Control")))
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "PKA response must include Cache-Control: no-store");
        }

        var parsed = ParseV2SignatureHeaders(res);
        var now = NowUnixForTesting();
        if (parsed.Expires <= parsed.Created || parsed.Expires - parsed.Created > 300)
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "Invalid signature freshness window");
        }
        const long skewSeconds = 30;
        if (parsed.Created - now > skewSeconds || now - parsed.Expires > skewSeconds)
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "Signature timestamp outside acceptance window");
        }
        if (!TimingSafeEqualString(parsed.Keyid, expectedKeyid))
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "Signature keyid mismatch");
        }
        if (!TimingSafeEqualString(AsciiToLower(parsed.Alg), "ed25519"))
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "Unsupported signature algorithm");
        }
        if (!TimingSafeEqualString(parsed.Nonce, nonce))
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "Signature nonce mismatch");
        }

        if (!TimingSafeEqualString(parsed.Tag, "aid-pka-v2"))
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "Invalid signature tag");
        }
        // Domain binding is derived from the signed covered set (aid-domain coverage), not the tag.
        var isDomainBound = parsed.DomainBound;
        // Primary protection: a response that covers aid-domain is only meaningful when the client
        // committed to a domain via the AID-Domain header. Reject otherwise (fail closed).
        if (isDomainBound && canonicalDomain is null)
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "Response covers aid-domain but no AID-Domain was sent");
        }

        var baseBytes = BuildV2SignatureBase(parsed.Covered, parsed.SignatureParamsRaw, "GET", requestUri, authority, status, canonicalDomain);
        VerifyEd25519(pub, baseBytes, parsed.Signature);
        return isDomainBound;
    }

    private static (byte[] PublicKey, string Keyid) DeriveAid2KeyMaterial(string pka)
    {
        var publicKey = Aid.DecodeUnpaddedBase64Url(pka, nameof(Constants.ERR_SECURITY));
        if (publicKey.Length != 32)
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "Invalid PKA length");
        }
        var thumbprintInput = Encoding.UTF8.GetBytes($"{{\"crv\":\"Ed25519\",\"kty\":\"OKP\",\"x\":\"{pka}\"}}");
        var digest = SHA256.HashData(thumbprintInput);
        return (publicKey, Base64UrlEncode(digest));
    }

    private static string NormalizeRequestUri(string uri)
    {
        if (!Uri.TryCreate(uri, UriKind.Absolute, out var parsed) || string.IsNullOrEmpty(parsed.Host))
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "Invalid URI for handshake");
        }
        var pathAndQuery = parsed.PathAndQuery;
        return $"{parsed.Scheme.ToLowerInvariant()}://{RequestAuthority(uri)}{pathAndQuery}";
    }

    private static string RequestAuthority(string uri)
    {
        var parsed = new Uri(uri);
        var host = parsed.Host;
        if (host.StartsWith("[", StringComparison.Ordinal) && host.EndsWith("]", StringComparison.Ordinal))
        {
            host = host[1..^1];
        }
        host = host.ToLowerInvariant();
        if (host.Contains(':'))
        {
            host = $"[{host}]";
        }
        if (parsed.IsDefaultPort)
        {
            return host;
        }
        return $"{host}:{parsed.Port}";
    }

    private static string BuildAcceptSignatureV2(string keyid, string nonce, bool domainBound = false)
    {
        // The tag is a fixed profile identifier (RFC 9421 section 2.3); domain binding is signalled
        // by including "aid-domain";req in the covered set, not by a distinct tag.
        var covered = domainBound
            ? "(\"@method\";req \"@target-uri\";req \"@authority\";req \"aid-domain\";req \"@status\")"
            : "(\"@method\";req \"@target-uri\";req \"@authority\";req \"@status\")";
        return $"aid-pka={covered};created;expires;keyid=\"{keyid}\";alg=\"ed25519\";nonce=\"{nonce}\";tag=\"aid-pka-v2\"";
    }

    private static bool HasNoStoreDirective(string cacheControl)
    {
        if (string.IsNullOrWhiteSpace(cacheControl))
        {
            return false;
        }
        return cacheControl
            .Split(',')
            .Select(part => part.Trim().Split(';', 2)[0].Trim())
            .Any(part => string.Equals(part, "no-store", StringComparison.OrdinalIgnoreCase));
    }

    private sealed record V2CoveredItem(string Raw, string Name, bool Req);

    private sealed record V2SignatureHeaders(
        List<V2CoveredItem> Covered,
        string SignatureParamsRaw,
        long Created,
        long Expires,
        string Keyid,
        string Alg,
        string Nonce,
        string Tag,
        bool DomainBound,
        byte[] Signature
    );

    private static V2SignatureHeaders ParseV2SignatureHeaders(HttpResponseMessage res)
    {
        var sigInput = GetHeader(res, "Signature-Input");
        var sig = GetHeader(res, "Signature");
        if (string.IsNullOrEmpty(sigInput) || string.IsNullOrEmpty(sig))
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "Missing signature headers");
        }

        var signatureParamsRaw = ExtractDictionaryMember(sigInput, "aid-pka");
        if (!signatureParamsRaw.StartsWith("(", StringComparison.Ordinal))
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "Invalid Signature-Input");
        }
        var closeIndex = signatureParamsRaw.IndexOf(')');
        if (closeIndex < 0)
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "Invalid Signature-Input");
        }

        var coveredRaw = signatureParamsRaw[1..closeIndex].Trim();
        var paramsRaw = signatureParamsRaw[(closeIndex + 1)..];
        var covered = SplitInnerListItems(coveredRaw).Select(ParseV2CoveredItem).ToList();

        var parameters = ParseSignatureParams(paramsRaw);
        foreach (var required in new[] { "created", "expires", "keyid", "alg", "nonce", "tag" })
        {
            if (!parameters.ContainsKey(required))
            {
                throw new AidError(nameof(Constants.ERR_SECURITY), "Invalid Signature-Input");
            }
        }
        if (!long.TryParse(parameters["created"], out var created) || !long.TryParse(parameters["expires"], out var expires))
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "Invalid Signature-Input timestamp");
        }

        // Domain binding is derived from the signed covered set (aid-domain coverage), not the tag.
        var domainBound = ValidateV2CoveredSet(covered);

        var signatureRaw = ExtractDictionaryMember(sig, "aid-pka");
        if (!signatureRaw.StartsWith(":", StringComparison.Ordinal) || !signatureRaw.EndsWith(":", StringComparison.Ordinal) || signatureRaw.Length < 3)
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "Invalid Signature header");
        }
        byte[] signature;
        try
        {
            signature = Convert.FromBase64String(signatureRaw[1..^1].Trim());
        }
        catch (FormatException)
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "Invalid Signature header");
        }

        return new V2SignatureHeaders(
            covered,
            signatureParamsRaw,
            created,
            expires,
            parameters["keyid"],
            parameters["alg"],
            parameters["nonce"],
            parameters["tag"],
            domainBound,
            signature
        );
    }

    private static List<string> SplitDictionaryMembers(string input)
    {
        var parts = new List<string>();
        var start = 0;
        var depth = 0;
        var inString = false;
        var inBytes = false;
        var escaped = false;
        for (int i = 0; i < input.Length; i++)
        {
            var c = input[i];
            if (escaped)
            {
                escaped = false;
                continue;
            }
            if (inString)
            {
                if (c == '\\') escaped = true;
                else if (c == '"') inString = false;
                continue;
            }
            if (c == '"')
            {
                inString = true;
                continue;
            }
            if (c == ':')
            {
                inBytes = !inBytes;
                continue;
            }
            if (inBytes)
            {
                continue;
            }
            if (c == '(') depth++;
            else if (c == ')' && depth > 0) depth--;
            else if (c == ',' && depth == 0)
            {
                var part = input[start..i].Trim();
                if (part.Length > 0) parts.Add(part);
                start = i + 1;
            }
        }
        var tail = input[start..].Trim();
        if (tail.Length > 0) parts.Add(tail);
        return parts;
    }

    private static string ExtractDictionaryMember(string input, string label)
    {
        string? value = null;
        var sawCaseConfusedLabel = false;
        foreach (var part in SplitDictionaryMembers(input))
        {
            var eq = part.IndexOf('=');
            if (eq <= 0)
            {
                continue;
            }
            var memberLabel = part[..eq].Trim();
            if (string.Equals(memberLabel, label, StringComparison.Ordinal))
            {
                if (value is not null)
                {
                    throw new AidError(nameof(Constants.ERR_SECURITY), $"Duplicate {label} signature member");
                }
                value = part[(eq + 1)..].Trim();
            }
            else if (string.Equals(memberLabel, label, StringComparison.OrdinalIgnoreCase))
            {
                sawCaseConfusedLabel = true;
            }
        }
        if (value is not null)
        {
            if (sawCaseConfusedLabel)
            {
                throw new AidError(nameof(Constants.ERR_SECURITY), $"Invalid {label} signature member casing");
            }
            return value;
        }
        throw new AidError(nameof(Constants.ERR_SECURITY), $"Missing {label} signature member");
    }

    private static List<string> SplitInnerListItems(string input)
    {
        var items = new List<string>();
        var start = 0;
        var inString = false;
        var escaped = false;
        for (int i = 0; i < input.Length; i++)
        {
            var c = input[i];
            if (escaped)
            {
                escaped = false;
                continue;
            }
            if (inString)
            {
                if (c == '\\') escaped = true;
                else if (c == '"') inString = false;
                continue;
            }
            if (c == '"')
            {
                inString = true;
                continue;
            }
            if (char.IsWhiteSpace(c))
            {
                var item = input[start..i].Trim();
                if (item.Length > 0) items.Add(item);
                start = i + 1;
            }
        }
        var tail = input[start..].Trim();
        if (tail.Length > 0) items.Add(tail);
        return items;
    }

    private static V2CoveredItem ParseV2CoveredItem(string raw)
    {
        var match = Regex.Match(raw, "^\"([^\"]+)\"((?:;[A-Za-z0-9_*.-]+)*)$");
        if (!match.Success)
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "Invalid Signature-Input covered item");
        }
        var name = match.Groups[1].Value;
        var req = false;
        var paramRaw = match.Groups[2].Value;
        if (paramRaw.Length > 0)
        {
            foreach (var parameter in paramRaw.Split(';', StringSplitOptions.RemoveEmptyEntries))
            {
                var param = parameter.Trim();
                if (param != "req")
                {
                    throw new AidError(nameof(Constants.ERR_SECURITY), "Unsupported Signature-Input covered item parameter");
                }
                if (req)
                {
                    throw new AidError(nameof(Constants.ERR_SECURITY), "Duplicate Signature-Input covered item parameter");
                }
                req = true;
            }
        }
        if (name is not ("@method" or "@target-uri" or "@authority" or "@status" or "aid-domain"))
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), $"Unsupported covered field: {name}");
        }
        return new V2CoveredItem(raw, name, req);
    }

    // Validates the covered set against the two permitted shapes and returns whether the
    // proof is domain-bound (i.e. the signed covered set includes "aid-domain";req).
    // Shape A (unbound): @method;req @target-uri;req @authority;req @status
    // Shape B (bound):   @method;req @target-uri;req @authority;req aid-domain;req @status
    // The covered set lives in the signed @signature-params, so this distinction is authenticated.
    private static bool ValidateV2CoveredSet(List<V2CoveredItem> covered)
    {
        var baseSet = new (string Name, bool Req)[]
        {
            ("@method", true),
            ("@target-uri", true),
            ("@authority", true),
            ("@status", false),
        };

        var domainBound = covered.Count == baseSet.Length + 1
            && covered.Count > 3
            && covered[3].Name == "aid-domain";

        var expected = domainBound
            ? new (string Name, bool Req)[] { baseSet[0], baseSet[1], baseSet[2], ("aid-domain", true), baseSet[3] }
            : baseSet;

        if (covered.Count != expected.Length)
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "Signature-Input must cover required fields");
        }

        for (int i = 0; i < expected.Length; i++)
        {
            if (covered[i].Name != expected[i].Name || covered[i].Req != expected[i].Req)
            {
                throw new AidError(nameof(Constants.ERR_SECURITY), "Signature-Input must cover required fields");
            }
        }

        return domainBound;
    }

    private static string UnquoteSfString(string value)
    {
        if (!value.StartsWith("\"", StringComparison.Ordinal) || !value.EndsWith("\"", StringComparison.Ordinal) || value.Length < 2)
        {
            return value;
        }
        var sb = new StringBuilder();
        for (int i = 1; i < value.Length - 1; i++)
        {
            if (value[i] == '\\' && i + 1 < value.Length - 1)
            {
                i++;
            }
            sb.Append(value[i]);
        }
        return sb.ToString();
    }

    private static Dictionary<string, string> ParseSignatureParams(string raw)
    {
        var parameters = new Dictionary<string, string>(StringComparer.Ordinal);
        var allowedParameters = new HashSet<string>(StringComparer.Ordinal)
        {
            "nonce",
            "keyid",
            "alg",
            "created",
            "expires",
            "tag",
        };
        var i = 0;
        while (i < raw.Length)
        {
            while (i < raw.Length && char.IsWhiteSpace(raw[i])) i++;
            if (i >= raw.Length) break;
            if (raw[i] != ';') throw new AidError(nameof(Constants.ERR_SECURITY), "Invalid Signature-Input parameters");
            i++;
            while (i < raw.Length && char.IsWhiteSpace(raw[i])) i++;
            var nameStart = i;
            while (i < raw.Length && IsParamNameChar(raw[i])) i++;
            var name = raw[nameStart..i];
            if (name.Length == 0) throw new AidError(nameof(Constants.ERR_SECURITY), "Invalid Signature-Input parameter");
            if (!allowedParameters.Contains(name))
            {
                throw new AidError(nameof(Constants.ERR_SECURITY), $"Unsupported Signature-Input parameter: {name}");
            }
            if (parameters.ContainsKey(name))
            {
                throw new AidError(nameof(Constants.ERR_SECURITY), $"Duplicate Signature-Input parameter: {name}");
            }
            while (i < raw.Length && char.IsWhiteSpace(raw[i])) i++;
            if (i >= raw.Length || raw[i] != '=')
            {
                parameters[name] = string.Empty;
                continue;
            }
            i++;
            while (i < raw.Length && char.IsWhiteSpace(raw[i])) i++;
            var valueStart = i;
            if (i < raw.Length && raw[i] == '"')
            {
                i++;
                var escaped = false;
                while (i < raw.Length)
                {
                    var c = raw[i];
                    if (escaped) escaped = false;
                    else if (c == '\\') escaped = true;
                    else if (c == '"')
                    {
                        i++;
                        break;
                    }
                    i++;
                }
            }
            else
            {
                while (i < raw.Length && raw[i] != ';') i++;
            }
            var rawValue = raw[valueStart..i].Trim();
            parameters[name] = name is "created" or "expires" ? rawValue : UnquoteSfString(rawValue);
        }
        return parameters;
    }

    private static bool IsParamNameChar(char c)
    {
        return (c >= 'A' && c <= 'Z') ||
               (c >= 'a' && c <= 'z') ||
               (c >= '0' && c <= '9') ||
               c == '_' ||
               c == '*' ||
               c == '.' ||
               c == '-';
    }

    private static byte[] BuildV2SignatureBase(List<V2CoveredItem> covered, string signatureParamsRaw, string method, string targetUri, string authority, int status, string? aidDomain = null)
    {
        var lines = new List<string>();
        foreach (var item in covered)
        {
            switch (item.Name)
            {
                case "@method":
                    lines.Add($"{item.Raw}: {method}");
                    break;
                case "@target-uri":
                    lines.Add($"{item.Raw}: {targetUri}");
                    break;
                case "@authority":
                    lines.Add($"{item.Raw}: {authority}");
                    break;
                case "@status":
                    lines.Add($"{item.Raw}: {status}");
                    break;
                case "aid-domain":
                    if (aidDomain is null)
                    {
                        throw new AidError(nameof(Constants.ERR_SECURITY), "Signature covers aid-domain but no AID-Domain was sent");
                    }
                    lines.Add($"{item.Raw}: {aidDomain}");
                    break;
                default:
                    throw new AidError(nameof(Constants.ERR_SECURITY), $"Unsupported covered field: {item.Name}");
            }
        }
        lines.Add($"\"@signature-params\": {signatureParamsRaw}");
        return Encoding.UTF8.GetBytes(string.Join('\n', lines));
    }

    private static void VerifyEd25519(byte[] publicKeyBytes, byte[] baseBytes, byte[] signature)
    {
        var algorithm = SignatureAlgorithm.Ed25519;
        var publicKey = PublicKey.Import(algorithm, publicKeyBytes, KeyBlobFormat.RawPublicKey);
        if (!algorithm.Verify(publicKey, baseBytes, signature))
        {
            throw new AidError(nameof(Constants.ERR_SECURITY), "PKA signature verification failed");
        }
    }
}
