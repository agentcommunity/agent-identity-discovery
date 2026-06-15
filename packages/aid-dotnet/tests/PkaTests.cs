using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using NSec.Cryptography;

namespace AidDiscovery.Tests;

public class PkaTests
{
    private static string RepoRoot()
    {
        var d = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (d != null)
        {
            if (File.Exists(Path.Combine(d.FullName, "protocol", "pka_vectors.json")))
            {
                return d.FullName;
            }
            d = d.Parent;
        }
        return Directory.GetCurrentDirectory();
    }

    private static byte[] SeedFromVector(JsonElement v) => Convert.FromBase64String(v.GetProperty("key").GetProperty("seed_b64").GetString()!);

    private static JsonElement V2Vector(string id = "v2-rfc9421-response-signature")
    {
        var vectorsPath = Path.Combine(RepoRoot(), "protocol", "pka_vectors.json");
        using var doc = JsonDocument.Parse(File.ReadAllText(vectorsPath));
        foreach (var v in doc.RootElement.GetProperty("vectors").EnumerateArray())
        {
            if (v.GetProperty("id").GetString() == id)
            {
                return v.Clone();
            }
        }
        throw new InvalidOperationException($"Missing v2 PKA vector {id}");
    }

    private static string PkaFromPub(byte[] pub)
    {
        // base58 encode
        const string alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
        int zeros = 0; while (zeros < pub.Length && pub[zeros] == 0) zeros++;
        int size = pub.Length * 138 / 100 + 1; var b = new byte[size];
        foreach (var v in pub)
        {
            int carry = v;
            for (int j = size - 1; j >= 0; j--) { carry += 256 * b[j]; b[j] = (byte)(carry % 58); carry /= 58; }
        }
        int it = 0; while (it < size && b[it] == 0) it++;
        var sb = new StringBuilder(new string('1', zeros));
        for (; it < size; it++) sb.Append(alphabet[b[it]]);
        return "z" + sb.ToString();
    }

    private sealed class MiniServer : IDisposable
    {
        private readonly HttpListener _listener;
        private readonly CancellationTokenSource _cts = new();
        private readonly Task _loop;
        public readonly int Port;
        private readonly JsonElement _vector;
        private readonly byte[] _seed;

        public MiniServer(JsonElement vector)
        {
            _vector = vector;
            _seed = SeedFromVector(vector);
            // pick free port
            using var l = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
            l.Start();
            Port = ((IPEndPoint)l.LocalEndpoint).Port;
            l.Stop();
            _listener = new HttpListener();
            _listener.Prefixes.Add($"http://127.0.0.1:{Port}/");
            _listener.Start();
            _loop = Task.Run(LoopAsync);
        }

        private async Task LoopAsync()
        {
            while (!_cts.IsCancellationRequested)
            {
                HttpListenerContext ctx;
                try { ctx = await _listener.GetContextAsync(); }
                catch { break; }
                _ = Task.Run(() => HandleAsync(ctx));
            }
        }

        private static byte[] BuildBase(string[] covered, long created, string keyidRaw, string alg, string method, string targetUri, string host, string date, string challenge)
        {
            var lines = new List<string>();
            foreach (var item in covered)
            {
                switch (item)
                {
                    case "AID-Challenge": lines.Add($"\"AID-Challenge\": {challenge}"); break;
                    case "@method": lines.Add($"\"@method\": {method}"); break;
                    case "@target-uri": lines.Add($"\"@target-uri\": {targetUri}"); break;
                    case "host": lines.Add($"\"host\": {host}"); break;
                    case "date": lines.Add($"\"date\": {date}"); break;
                    default: throw new Exception($"Unsupported covered field: {item}");
                }
            }
            var quoted = string.Join(' ', covered.Select(c => $"\"{c}\""));
            var paramsStr = $"({quoted});created={created};keyid={keyidRaw};alg=\"{alg}\"";
            lines.Add($"\"@signature-params\": {paramsStr}");
            return Encoding.UTF8.GetBytes(string.Join('\n', lines));
        }

        private async Task HandleAsync(HttpListenerContext ctx)
        {
            var path = ctx.Request.Url!.AbsolutePath;
            var recordUri = $"http://127.0.0.1:{Port}/mcp";
            var seed = _seed;
            var algorithm = SignatureAlgorithm.Ed25519;
            var key = Key.Import(algorithm, seed, KeyBlobFormat.RawPrivateKey);
            var pub = key.Export(KeyBlobFormat.RawPublicKey);
            var pka = PkaFromPub(pub);
            if (path == "/.well-known/agent")
            {
                var body = $"{{\"v\":\"aid1\",\"u\":\"{recordUri}\",\"p\":\"mcp\",\"k\":\"{pka}\",\"i\":\"g1\"}}";
                var bytes = Encoding.UTF8.GetBytes(body);
                ctx.Response.StatusCode = 200;
                ctx.Response.ContentType = "application/json";
                await ctx.Response.OutputStream.WriteAsync(bytes, 0, bytes.Length);
                ctx.Response.Close();
                return;
            }
            if (path == "/mcp")
            {
                var order = _vector.GetProperty("covered").EnumerateArray().Select(e => e.GetString()!).ToArray();
                var kid = _vector.TryGetProperty("overrideKeyId", out var kidOv) ? kidOv.GetString()! : "g1";
                var alg = _vector.TryGetProperty("overrideAlg", out var algOv) ? algOv.GetString()! : "ed25519";
                var created = _vector.GetProperty("expect").GetString() == "pass" ?
                    DateTimeOffset.UtcNow.ToUnixTimeSeconds() :
                    _vector.GetProperty("created").GetInt64();
                var date = ctx.Request.Headers["Date"] ?? DateTimeOffset.UtcNow.ToString("r");
                var challenge = ctx.Request.Headers["AID-Challenge"] ?? "";
                var target = ctx.Request.Url!.ToString();
                var host = new Uri(target).Authority;
                var baseBytes = BuildBase(order, created, kid, alg, "GET", target, host, date, challenge);
                var sig = algorithm.Sign(key, baseBytes);
                var sigB64 = Convert.ToBase64String(sig);
                ctx.Response.StatusCode = 200;
                ctx.Response.Headers["Signature-Input"] = $"sig=(\"{string.Join("\" \"", order)}\");created={created};keyid={kid};alg=\"{alg}\"";
                ctx.Response.Headers["Signature"] = $"sig=:{sigB64}:";
                ctx.Response.Headers["Date"] = date;
                await ctx.Response.OutputStream.WriteAsync(Array.Empty<byte>());
                ctx.Response.Close();
                return;
            }
            ctx.Response.StatusCode = 404; ctx.Response.Close();
        }

        public void Dispose()
        {
            _cts.Cancel();
            _listener.Stop();
            _listener.Close();
        }
    }

    // ---- Task N1 / N2 new tests ----

    [Fact]
    public async Task V2DbDomainMismatchIsRejected()
    {
        // Cross-domain forgery: response covers aid-domain (single tag aid-pka-v2) and the client
        // sent AID-Domain example.com, but the signature was computed over evil.example. The
        // verifier rebuilds the base with the committed domain, so Ed25519 verification fails.
        var vector = V2Vector("v2-db-domain-mismatch");
        var nonce = Base64UrlDecode(vector.GetProperty("nonce").GetString()!);
        var oldFill = Pka.FillRandomBytesForTesting;
        var oldNow = Pka.NowUnixForTesting;
        var oldSend = Pka.SendAsyncForTesting;
        Pka.FillRandomBytesForTesting = bytes => Array.Copy(nonce, bytes, bytes.Length);
        Pka.NowUnixForTesting = () => vector.GetProperty("created").GetInt64();
        Pka.SendAsyncForTesting = (_, _) =>
        {
            var responseVector = vector.GetProperty("response");
            var response = new HttpResponseMessage((System.Net.HttpStatusCode)responseVector.GetProperty("status").GetInt32());
            response.Headers.TryAddWithoutValidation("Cache-Control", responseVector.GetProperty("cache_control").GetString());
            response.Headers.TryAddWithoutValidation("Signature-Input", responseVector.GetProperty("signature_input").GetString());
            response.Headers.TryAddWithoutValidation("Signature", responseVector.GetProperty("signature").GetString());
            return Task.FromResult(response);
        };
        try
        {
            var record = vector.GetProperty("record");
            var ex = await Assert.ThrowsAsync<AidError>(() =>
                Pka.PerformHandshakeAsync(record.GetProperty("u").GetString()!, record.GetProperty("k").GetString()!, string.Empty, TimeSpan.FromSeconds(1), domain: vector.GetProperty("domain").GetString())
            );
            Assert.Equal(nameof(Constants.ERR_SECURITY), ex.ErrorCode);
            Assert.Contains("PKA signature verification failed", ex.Message);
        }
        finally
        {
            Pka.FillRandomBytesForTesting = oldFill;
            Pka.NowUnixForTesting = oldNow;
            Pka.SendAsyncForTesting = oldSend;
        }
    }

    [Fact]
    public async Task V2DbDomainBoundVectorRunsAgainstHandshake()
    {
        var vector = V2Vector("v2-db-rfc9421-domain-bound");
        var nonce = Base64UrlDecode(vector.GetProperty("nonce").GetString()!);
        var oldFill = Pka.FillRandomBytesForTesting;
        var oldNow = Pka.NowUnixForTesting;
        var oldSend = Pka.SendAsyncForTesting;
        Pka.FillRandomBytesForTesting = bytes => Array.Copy(nonce, bytes, bytes.Length);
        Pka.NowUnixForTesting = () => vector.GetProperty("created").GetInt64();
        var expectedAidDomain = vector.GetProperty("request").GetProperty("aid_domain").GetString()!;
        Pka.SendAsyncForTesting = (request, _) =>
        {
            // Assert the AID-Domain header is sent and equals the canonical domain
            Assert.True(request.Headers.Contains("AID-Domain"), "Expected AID-Domain header to be set");
            Assert.Equal(expectedAidDomain, request.Headers.GetValues("AID-Domain").Single());

            var expectedRequest = vector.GetProperty("request");
            Assert.Equal(expectedRequest.GetProperty("accept_signature").GetString(), request.Headers.GetValues("Accept-Signature").Single());

            var responseVector = vector.GetProperty("response");
            var response = new HttpResponseMessage((System.Net.HttpStatusCode)responseVector.GetProperty("status").GetInt32());
            response.Headers.TryAddWithoutValidation("Cache-Control", responseVector.GetProperty("cache_control").GetString());
            response.Headers.TryAddWithoutValidation("Signature-Input", responseVector.GetProperty("signature_input").GetString());
            response.Headers.TryAddWithoutValidation("Signature", responseVector.GetProperty("signature").GetString());
            return Task.FromResult(response);
        };
        try
        {
            var record = vector.GetProperty("record");
            var domainBound = await Pka.PerformHandshakeAsync(record.GetProperty("u").GetString()!, record.GetProperty("k").GetString()!, string.Empty, TimeSpan.FromSeconds(1), domain: vector.GetProperty("domain").GetString());
            Assert.True(domainBound, "Expected DomainBound=true for domain-bound (aid-domain covered) response");
        }
        finally
        {
            Pka.FillRandomBytesForTesting = oldFill;
            Pka.NowUnixForTesting = oldNow;
            Pka.SendAsyncForTesting = oldSend;
        }
    }

    [Fact]
    public async Task WellKnownFallbackSendsAidDomainAndSurfacesDomainBound()
    {
        var vector = V2Vector("v2-db-rfc9421-domain-bound");
        var nonce = Base64UrlDecode(vector.GetProperty("nonce").GetString()!);
        var record = vector.GetProperty("record");
        var recordUri = record.GetProperty("u").GetString()!;
        var recordPka = record.GetProperty("k").GetString()!;
        var queriedDomain = vector.GetProperty("domain").GetString()!; // "example.com"

        // Serve the well-known JSON (v2 record) on a loopback HTTP server.
        var json = $"{{\"v\":\"aid2\",\"u\":\"{recordUri}\",\"p\":\"mcp\",\"k\":\"{recordPka}\"}}";
        using var server = new WellKnownServer(json);

        var oldFill = Pka.FillRandomBytesForTesting;
        var oldNow = Pka.NowUnixForTesting;
        var oldSend = Pka.SendAsyncForTesting;
        Pka.FillRandomBytesForTesting = bytes => Array.Copy(nonce, bytes, bytes.Length);
        Pka.NowUnixForTesting = () => vector.GetProperty("created").GetInt64();
        Pka.SendAsyncForTesting = (request, _) =>
        {
            // The well-known fallback must thread the queried domain into the handshake
            // as the AID-Domain header (requesting a domain-bound proof).
            Assert.True(request.Headers.Contains("AID-Domain"), "Expected AID-Domain header to be set on well-known fallback handshake");
            Assert.Equal(queriedDomain, request.Headers.GetValues("AID-Domain").Single());
            Assert.Equal(recordUri, request.RequestUri!.ToString());

            var responseVector = vector.GetProperty("response");
            var response = new HttpResponseMessage((HttpStatusCode)responseVector.GetProperty("status").GetInt32());
            response.Headers.TryAddWithoutValidation("Cache-Control", responseVector.GetProperty("cache_control").GetString());
            response.Headers.TryAddWithoutValidation("Signature-Input", responseVector.GetProperty("signature_input").GetString());
            response.Headers.TryAddWithoutValidation("Signature", responseVector.GetProperty("signature").GetString());
            return Task.FromResult(response);
        };
        try
        {
            // domain (host for the well-known GET) is the loopback server; queriedDomain is the canonical domain.
            var (rec, domainBound) = await WellKnown.FetchAsync($"127.0.0.1:{server.Port}", TimeSpan.FromSeconds(3), allowInsecure: true, queriedDomain: queriedDomain);
            Assert.Equal(recordUri, rec.Uri);
            Assert.True(domainBound, "Expected DomainBound=true from well-known fallback for domain-bound (aid-domain covered) response");
        }
        finally
        {
            Pka.FillRandomBytesForTesting = oldFill;
            Pka.NowUnixForTesting = oldNow;
            Pka.SendAsyncForTesting = oldSend;
        }
    }

    private sealed class WellKnownServer : IDisposable
    {
        private readonly HttpListener _listener;
        private readonly CancellationTokenSource _cts = new();
        private readonly Task _loop;
        public readonly int Port;
        private readonly string _json;

        public WellKnownServer(string json)
        {
            _json = json;
            using var l = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
            l.Start();
            Port = ((IPEndPoint)l.LocalEndpoint).Port;
            l.Stop();
            _listener = new HttpListener();
            _listener.Prefixes.Add($"http://127.0.0.1:{Port}/");
            _listener.Start();
            _loop = Task.Run(LoopAsync);
        }

        private async Task LoopAsync()
        {
            while (!_cts.IsCancellationRequested)
            {
                HttpListenerContext ctx;
                try { ctx = await _listener.GetContextAsync(); }
                catch { break; }
                _ = Task.Run(() => HandleAsync(ctx));
            }
        }

        private async Task HandleAsync(HttpListenerContext ctx)
        {
            if (ctx.Request.Url!.AbsolutePath == "/.well-known/agent")
            {
                var bytes = Encoding.UTF8.GetBytes(_json);
                ctx.Response.StatusCode = 200;
                ctx.Response.ContentType = "application/json";
                await ctx.Response.OutputStream.WriteAsync(bytes, 0, bytes.Length);
                ctx.Response.Close();
                return;
            }
            ctx.Response.StatusCode = 404; ctx.Response.Close();
        }

        public void Dispose()
        {
            _cts.Cancel();
            _listener.Stop();
            _listener.Close();
        }
    }

    // ---- end new tests ----

    [Fact]
    public async Task Vectors_RunAgainstHandshake()
    {
        if (Environment.GetEnvironmentVariable("AID_RUN_INTEGRATION") != "1")
        {
            // Integration tests disabled by default
            return;
        }

        var vectorsPath = Path.Combine(RepoRoot(), "protocol", "pka_vectors.json");
        var doc = JsonDocument.Parse(await File.ReadAllTextAsync(vectorsPath));
        foreach (var v in doc.RootElement.GetProperty("vectors").EnumerateArray())
        {
            if (v.GetProperty("record").GetProperty("v").GetString() != "aid1")
            {
                continue;
            }
            using var server = new MiniServer(v);
            var domain = $"127.0.0.1:{server.Port}";
            var expect = v.GetProperty("expect").GetString();
            try
            {
                // .well-known fetch triggers handshake
                var (rec, _) = await WellKnown.FetchAsync(domain, TimeSpan.FromSeconds(3), allowInsecure: true);
                if (expect == "fail")
                {
                    // For a failing vector, ensure handshake fails by calling again with bad kid
                    await Assert.ThrowsAsync<AidError>(async () =>
                        await Pka.PerformHandshakeAsync(rec.Uri, rec.Pka!, "wrong", TimeSpan.FromSeconds(2))
                    );
                }
                // For pass vectors, the handshake should succeed (no exception thrown)
            }
            catch (AidError) when (expect == "fail")
            {
                // For fail vectors, it's acceptable if the initial handshake fails
                // This covers cases like timestamp outside window
            }
        }
    }

    [Fact]
    public async Task V2CanonicalRfc9421VectorRunsAgainstHandshake()
    {
        var vector = V2Vector();
        var nonce = Base64UrlDecode(vector.GetProperty("nonce").GetString()!);
        var oldFill = Pka.FillRandomBytesForTesting;
        var oldNow = Pka.NowUnixForTesting;
        var oldSend = Pka.SendAsyncForTesting;
        Pka.FillRandomBytesForTesting = bytes => Array.Copy(nonce, bytes, bytes.Length);
        Pka.NowUnixForTesting = () => vector.GetProperty("created").GetInt64();
        Pka.SendAsyncForTesting = (request, timeout) =>
        {
            var expectedRequest = vector.GetProperty("request");
            Assert.Equal(expectedRequest.GetProperty("method").GetString(), request.Method.Method);
            Assert.Equal(expectedRequest.GetProperty("target_uri").GetString(), request.RequestUri!.ToString());
            Assert.Equal(expectedRequest.GetProperty("accept_signature").GetString(), request.Headers.GetValues("Accept-Signature").Single());
            Assert.Equal(expectedRequest.GetProperty("cache_control").GetString(), request.Headers.CacheControl!.ToString());
            Assert.False(request.Headers.Contains("AID-Challenge"));
            Assert.False(request.Headers.Date.HasValue);

            var responseVector = vector.GetProperty("response");
            var response = new HttpResponseMessage((HttpStatusCode)responseVector.GetProperty("status").GetInt32());
            response.Headers.TryAddWithoutValidation("Cache-Control", responseVector.GetProperty("cache_control").GetString());
            response.Headers.TryAddWithoutValidation("Signature-Input", responseVector.GetProperty("signature_input").GetString());
            response.Headers.TryAddWithoutValidation("Signature", responseVector.GetProperty("signature").GetString());
            return Task.FromResult(response);
        };
        try
        {
            var record = vector.GetProperty("record");
            await Pka.PerformHandshakeAsync(record.GetProperty("u").GetString()!, record.GetProperty("k").GetString()!, string.Empty, TimeSpan.FromSeconds(1));
        }
        finally
        {
            Pka.FillRandomBytesForTesting = oldFill;
            Pka.NowUnixForTesting = oldNow;
            Pka.SendAsyncForTesting = oldSend;
        }
    }

    [Fact]
    public async Task V2CanonicalizesUppercaseHostDefaultPortQueryAndFragment()
    {
        var vector = V2Vector("v2-uppercase-host-default-port-canonical-target");
        var nonce = Base64UrlDecode(vector.GetProperty("nonce").GetString()!);
        var oldFill = Pka.FillRandomBytesForTesting;
        var oldNow = Pka.NowUnixForTesting;
        var oldSend = Pka.SendAsyncForTesting;
        Pka.FillRandomBytesForTesting = bytes => Array.Copy(nonce, bytes, bytes.Length);
        Pka.NowUnixForTesting = () => vector.GetProperty("created").GetInt64();
        Pka.SendAsyncForTesting = (request, timeout) =>
        {
            var expectedRequest = vector.GetProperty("request");
            Assert.Equal(expectedRequest.GetProperty("method").GetString(), request.Method.Method);
            Assert.Equal(expectedRequest.GetProperty("target_uri").GetString(), request.RequestUri!.ToString());
            Assert.Equal(expectedRequest.GetProperty("accept_signature").GetString(), request.Headers.GetValues("Accept-Signature").Single());

            var responseVector = vector.GetProperty("response");
            var response = new HttpResponseMessage((HttpStatusCode)responseVector.GetProperty("status").GetInt32());
            response.Headers.TryAddWithoutValidation("Cache-Control", responseVector.GetProperty("cache_control").GetString());
            response.Headers.TryAddWithoutValidation("Signature-Input", responseVector.GetProperty("signature_input").GetString());
            response.Headers.TryAddWithoutValidation("Signature", responseVector.GetProperty("signature").GetString());
            return Task.FromResult(response);
        };
        try
        {
            var record = vector.GetProperty("record");
            await Pka.PerformHandshakeAsync(record.GetProperty("u").GetString()!, record.GetProperty("k").GetString()!, string.Empty, TimeSpan.FromSeconds(1));
        }
        finally
        {
            Pka.FillRandomBytesForTesting = oldFill;
            Pka.NowUnixForTesting = oldNow;
            Pka.SendAsyncForTesting = oldSend;
        }
    }

    [Fact]
    public async Task V2RejectsRedirects()
    {
        var vector = V2Vector();
        var nonce = Base64UrlDecode(vector.GetProperty("nonce").GetString()!);
        var oldFill = Pka.FillRandomBytesForTesting;
        var oldNow = Pka.NowUnixForTesting;
        var oldSend = Pka.SendAsyncForTesting;
        Pka.FillRandomBytesForTesting = bytes => Array.Copy(nonce, bytes, bytes.Length);
        Pka.NowUnixForTesting = () => vector.GetProperty("created").GetInt64();
        Pka.SendAsyncForTesting = (_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.Found));
        try
        {
            var record = vector.GetProperty("record");
            var ex = await Assert.ThrowsAsync<AidError>(() =>
                Pka.PerformHandshakeAsync(record.GetProperty("u").GetString()!, record.GetProperty("k").GetString()!, string.Empty, TimeSpan.FromSeconds(1))
            );
            Assert.Equal(nameof(Constants.ERR_SECURITY), ex.ErrorCode);
        }
        finally
        {
            Pka.FillRandomBytesForTesting = oldFill;
            Pka.NowUnixForTesting = oldNow;
            Pka.SendAsyncForTesting = oldSend;
        }
    }

    [Fact]
    public async Task V2RejectsMissingResponseNoStore()
    {
        var ex = await Assert.ThrowsAsync<AidError>(() => RunV2VectorWithResponseAsync(
            (response, _) => response.Headers.Remove("Cache-Control")
        ));

        Assert.Equal(nameof(Constants.ERR_SECURITY), ex.ErrorCode);
    }

    [Fact]
    public async Task V2RejectsMissingExpires()
    {
        var ex = await Assert.ThrowsAsync<AidError>(() => RunV2VectorWithResponseAsync(
            (response, vector) =>
            {
                var input = vector.GetProperty("response").GetProperty("signature_input").GetString()!;
                response.Headers.Remove("Signature-Input");
                response.Headers.TryAddWithoutValidation("Signature-Input", input.Replace(";expires=1767139260", string.Empty));
            }
        ));

        Assert.Equal(nameof(Constants.ERR_SECURITY), ex.ErrorCode);
    }

    [Fact]
    public async Task V2RejectsFreshnessWindowOver300Seconds()
    {
        var ex = await Assert.ThrowsAsync<AidError>(() => RunV2VectorWithResponseAsync(
            (response, vector) =>
            {
                var input = vector.GetProperty("response").GetProperty("signature_input").GetString()!;
                response.Headers.Remove("Signature-Input");
                response.Headers.TryAddWithoutValidation("Signature-Input", input.Replace("expires=1767139260", "expires=1767139501"));
            }
        ));

        Assert.Equal(nameof(Constants.ERR_SECURITY), ex.ErrorCode);
    }

    [Fact]
    public async Task V2RejectsReqOnResponseStatusComponent()
    {
        var ex = await Assert.ThrowsAsync<AidError>(() => RunV2VectorWithResponseAsync(
            (response, vector) =>
            {
                var input = vector.GetProperty("response").GetProperty("signature_input").GetString()!;
                response.Headers.Remove("Signature-Input");
                response.Headers.TryAddWithoutValidation("Signature-Input", input.Replace("\"@status\"", "\"@status\";req"));
            }
        ));

        Assert.Equal(nameof(Constants.ERR_SECURITY), ex.ErrorCode);
    }

    [Theory]
    [InlineData("\"@method\";req;req")]
    [InlineData("\"@method\";REQ")]
    [InlineData("\"@method\";ReQ")]
    [InlineData("\"@method\";foo")]
    public async Task V2RejectsInvalidCoveredItemParameters(string coveredMethod)
    {
        var ex = await Assert.ThrowsAsync<AidError>(() => RunV2VectorWithResponseAsync(
            (response, vector) =>
            {
                var input = vector.GetProperty("response").GetProperty("signature_input").GetString()!;
                var mutated = input.Replace("\"@method\";req", coveredMethod);
                response.Headers.Remove("Signature-Input");
                response.Headers.Remove("Signature");
                response.Headers.TryAddWithoutValidation("Signature-Input", mutated);
                response.Headers.TryAddWithoutValidation("Signature", SignV2Response(vector, mutated));
            }
        ));

        Assert.Equal(nameof(Constants.ERR_SECURITY), ex.ErrorCode);
        Assert.Contains("Signature-Input covered item parameter", ex.Message);
    }

    [Theory]
    [InlineData("\"@method\";req \"@target-uri\";req \"@authority\";req \"@method\";req")]
    [InlineData("\"@method\";req \"@target-uri\";req \"@authority\";req")]
    [InlineData("\"@method\";req \"@target-uri\";req \"@authority\";req \"@status\" \"date\"")]
    public async Task V2RejectsInvalidCoveredItemSet(string coveredItems)
    {
        var ex = await Assert.ThrowsAsync<AidError>(() => RunV2VectorWithResponseAsync(
            (response, vector) =>
            {
                var input = vector.GetProperty("response").GetProperty("signature_input").GetString()!;
                var mutated = ReplaceV2CoveredList(input, coveredItems);
                response.Headers.Remove("Signature-Input");
                response.Headers.Remove("Signature");
                response.Headers.TryAddWithoutValidation("Signature-Input", mutated);
                response.Headers.TryAddWithoutValidation("Signature", SignV2Response(vector, mutated));
            }
        ));

        Assert.Equal(nameof(Constants.ERR_SECURITY), ex.ErrorCode);
    }

    [Fact]
    public async Task V2RejectsMixedCaseCoveredComponentName()
    {
        var ex = await Assert.ThrowsAsync<AidError>(() => RunV2VectorWithResponseAsync(
            (response, vector) =>
            {
                var input = vector.GetProperty("response").GetProperty("signature_input").GetString()!;
                var mutated = input.Replace("\"@method\";req", "\"@METHOD\";req");
                response.Headers.Remove("Signature-Input");
                response.Headers.Remove("Signature");
                response.Headers.TryAddWithoutValidation("Signature-Input", mutated);
                response.Headers.TryAddWithoutValidation("Signature", SignV2Response(vector, mutated));
            }
        ));

        Assert.Equal(nameof(Constants.ERR_SECURITY), ex.ErrorCode);
    }

    [Theory]
    [InlineData("created")]
    [InlineData("expires")]
    [InlineData("keyid")]
    [InlineData("alg")]
    [InlineData("nonce")]
    [InlineData("tag")]
    public async Task V2RejectsDuplicateCriticalSignatureInputParameters(string parameter)
    {
        var ex = await Assert.ThrowsAsync<AidError>(() => RunV2VectorWithResponseAsync(
            (response, vector) =>
            {
                var responseVector = vector.GetProperty("response");
                var input = responseVector.GetProperty("signature_input").GetString()!;
                var duplicate = parameter switch
                {
                    "created" => "created=1767139200",
                    "expires" => "expires=1767139260",
                    "keyid" => "keyid=\"WWpn_pfHui9YKR4CZtQsDGMu7_Gch2zYChfSvnxgtPk\"",
                    "alg" => "alg=\"ed25519\"",
                    "nonce" => "nonce=\"oKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr8\"",
                    "tag" => "tag=\"aid-pka-v2\"",
                    _ => throw new ArgumentOutOfRangeException(nameof(parameter), parameter, null),
                };
                var mutated = $"{input};{duplicate}";
                response.Headers.Remove("Signature-Input");
                response.Headers.Remove("Signature");
                response.Headers.TryAddWithoutValidation("Signature-Input", mutated);
                response.Headers.TryAddWithoutValidation("Signature", SignV2Response(vector, mutated));
            }
        ));

        Assert.Equal(nameof(Constants.ERR_SECURITY), ex.ErrorCode);
        Assert.Contains("Duplicate Signature-Input parameter", ex.Message);
    }

    [Fact]
    public async Task V2RejectsUnknownTopLevelSignatureInputParameter()
    {
        var ex = await Assert.ThrowsAsync<AidError>(() => RunV2VectorWithResponseAsync(
            (response, vector) =>
            {
                var input = vector.GetProperty("response").GetProperty("signature_input").GetString()!;
                var mutated = $"{input};foo=\"bar\"";
                response.Headers.Remove("Signature-Input");
                response.Headers.Remove("Signature");
                response.Headers.TryAddWithoutValidation("Signature-Input", mutated);
                response.Headers.TryAddWithoutValidation("Signature", SignV2Response(vector, mutated));
            }
        ));

        Assert.Equal(nameof(Constants.ERR_SECURITY), ex.ErrorCode);
        Assert.Contains("Unsupported Signature-Input parameter", ex.Message);
    }

    [Theory]
    [InlineData("created=", "Created=")]
    [InlineData("keyid=", "KeyID=")]
    [InlineData("alg=", "ALG=")]
    public async Task V2RejectsMixedCaseTopLevelSignatureInputParameterNames(string original, string replacement)
    {
        var ex = await Assert.ThrowsAsync<AidError>(() => RunV2VectorWithResponseAsync(
            (response, vector) =>
            {
                var input = vector.GetProperty("response").GetProperty("signature_input").GetString()!;
                var mutated = input.Replace(original, replacement);
                response.Headers.Remove("Signature-Input");
                response.Headers.Remove("Signature");
                response.Headers.TryAddWithoutValidation("Signature-Input", mutated);
                response.Headers.TryAddWithoutValidation("Signature", SignV2Response(vector, mutated));
            }
        ));

        Assert.Equal(nameof(Constants.ERR_SECURITY), ex.ErrorCode);
        Assert.Contains("Unsupported Signature-Input parameter", ex.Message);
    }

    [Theory]
    [InlineData("created")]
    [InlineData("expires")]
    public async Task V2RejectsQuotedNumericSignatureInputParameters(string parameter)
    {
        var ex = await Assert.ThrowsAsync<AidError>(() => RunV2VectorWithResponseAsync(
            (response, vector) =>
            {
                var input = vector.GetProperty("response").GetProperty("signature_input").GetString()!;
                var mutated = parameter switch
                {
                    "created" => input.Replace("created=1767139200", "created=\"1767139200\""),
                    "expires" => input.Replace("expires=1767139260", "expires=\"1767139260\""),
                    _ => throw new ArgumentOutOfRangeException(nameof(parameter), parameter, null),
                };
                response.Headers.Remove("Signature-Input");
                response.Headers.Remove("Signature");
                response.Headers.TryAddWithoutValidation("Signature-Input", mutated);
                response.Headers.TryAddWithoutValidation("Signature", SignV2Response(vector, mutated));
            }
        ));

        Assert.Equal(nameof(Constants.ERR_SECURITY), ex.ErrorCode);
        Assert.Contains("Invalid Signature-Input timestamp", ex.Message);
    }

    [Fact]
    public async Task V2RejectsDuplicateAidPkaSignatureInputDictionaryMember()
    {
        var ex = await Assert.ThrowsAsync<AidError>(() => RunV2VectorWithResponseAsync(
            (response, vector) =>
            {
                var input = vector.GetProperty("response").GetProperty("signature_input").GetString()!;
                response.Headers.Remove("Signature-Input");
                response.Headers.TryAddWithoutValidation("Signature-Input", $"{input}, aid-pka=(\"@method\");created=1767139200");
            }
        ));

        Assert.Equal(nameof(Constants.ERR_SECURITY), ex.ErrorCode);
        Assert.Contains("Duplicate aid-pka signature member", ex.Message);
    }

    [Fact]
    public async Task V2RejectsDuplicateAidPkaSignatureDictionaryMember()
    {
        var ex = await Assert.ThrowsAsync<AidError>(() => RunV2VectorWithResponseAsync(
            (response, vector) =>
            {
                var signature = vector.GetProperty("response").GetProperty("signature").GetString()!;
                response.Headers.Remove("Signature");
                response.Headers.TryAddWithoutValidation("Signature", $"{signature}, aid-pka=:QUFB:");
            }
        ));

        Assert.Equal(nameof(Constants.ERR_SECURITY), ex.ErrorCode);
        Assert.Contains("Duplicate aid-pka signature member", ex.Message);
    }

    [Theory]
    [InlineData("AID-PKA")]
    [InlineData("Aid-Pka")]
    public async Task V2RejectsMixedCaseSignatureInputDictionaryMember(string label)
    {
        var ex = await Assert.ThrowsAsync<AidError>(() => RunV2VectorWithResponseAsync(
            (response, vector) =>
            {
                var input = vector.GetProperty("response").GetProperty("signature_input").GetString()!;
                var mutated = input.Replace("aid-pka=", $"{label}=");
                response.Headers.Remove("Signature-Input");
                response.Headers.Remove("Signature");
                response.Headers.TryAddWithoutValidation("Signature-Input", mutated);
                response.Headers.TryAddWithoutValidation("Signature", SignV2Response(vector, mutated));
            }
        ));

        Assert.Equal(nameof(Constants.ERR_SECURITY), ex.ErrorCode);
        Assert.Contains("Missing aid-pka signature member", ex.Message);
    }

    [Theory]
    [InlineData("AID-PKA")]
    [InlineData("Aid-Pka")]
    public async Task V2RejectsMixedCaseSignatureDictionaryMember(string label)
    {
        var ex = await Assert.ThrowsAsync<AidError>(() => RunV2VectorWithResponseAsync(
            (response, vector) =>
            {
                var signature = vector.GetProperty("response").GetProperty("signature").GetString()!;
                response.Headers.Remove("Signature");
                response.Headers.TryAddWithoutValidation("Signature", signature.Replace("aid-pka=", $"{label}="));
            }
        ));

        Assert.Equal(nameof(Constants.ERR_SECURITY), ex.ErrorCode);
        Assert.Contains("Missing aid-pka signature member", ex.Message);
    }

    [Fact]
    public async Task V2RejectsExactPlusMixedCaseSignatureInputDictionaryMember()
    {
        var ex = await Assert.ThrowsAsync<AidError>(() => RunV2VectorWithResponseAsync(
            (response, vector) =>
            {
                var input = vector.GetProperty("response").GetProperty("signature_input").GetString()!;
                response.Headers.Remove("Signature-Input");
                response.Headers.TryAddWithoutValidation("Signature-Input", $"{input}, AID-PKA=(\"@method\");created=1767139200");
            }
        ));

        Assert.Equal(nameof(Constants.ERR_SECURITY), ex.ErrorCode);
        Assert.Contains("aid-pka signature member", ex.Message);
    }

    [Fact]
    public async Task V2RejectsExactPlusMixedCaseSignatureDictionaryMember()
    {
        var ex = await Assert.ThrowsAsync<AidError>(() => RunV2VectorWithResponseAsync(
            (response, vector) =>
            {
                var signature = vector.GetProperty("response").GetProperty("signature").GetString()!;
                response.Headers.Remove("Signature");
                response.Headers.TryAddWithoutValidation("Signature", $"{signature}, Aid-Pka=:QUFB:");
            }
        ));

        Assert.Equal(nameof(Constants.ERR_SECURITY), ex.ErrorCode);
        Assert.Contains("aid-pka signature member", ex.Message);
    }

    [Theory]
    [InlineData("Signature-Input")]
    [InlineData("Signature")]
    public async Task V2RejectsDuplicateAidPkaDictionaryMemberAcrossRepeatedHeaderValues(string headerName)
    {
        var ex = await Assert.ThrowsAsync<AidError>(() => RunV2VectorWithResponseAsync(
            (response, vector) =>
            {
                var responseVector = vector.GetProperty("response");
                if (headerName == "Signature-Input")
                {
                    response.Headers.Remove("Signature-Input");
                    response.Headers.TryAddWithoutValidation("Signature-Input", responseVector.GetProperty("signature_input").GetString());
                    response.Headers.TryAddWithoutValidation("Signature-Input", "aid-pka=(\"@method\");created=1767139200");
                    return;
                }

                response.Headers.Remove("Signature");
                response.Headers.TryAddWithoutValidation("Signature", responseVector.GetProperty("signature").GetString());
                response.Headers.TryAddWithoutValidation("Signature", "aid-pka=:QUFB:");
            }
        ));

        Assert.Equal(nameof(Constants.ERR_SECURITY), ex.ErrorCode);
        Assert.Contains("Duplicate aid-pka signature member", ex.Message);
    }

    [Fact]
    public async Task V2UsesBracketedIpv6AuthorityWithNonDefaultPort()
    {
        var vector = V2Vector();
        var nonce = Base64UrlDecode(vector.GetProperty("nonce").GetString()!);
        var oldFill = Pka.FillRandomBytesForTesting;
        var oldNow = Pka.NowUnixForTesting;
        var oldSend = Pka.SendAsyncForTesting;
        var targetUri = "https://[2001:db8::10]:8443/mcp?check=1";
        var authority = "[2001:db8::10]:8443";

        Pka.FillRandomBytesForTesting = bytes => Array.Copy(nonce, bytes, bytes.Length);
        Pka.NowUnixForTesting = () => vector.GetProperty("created").GetInt64();
        Pka.SendAsyncForTesting = (request, _) =>
        {
            Assert.Equal(targetUri, request.RequestUri!.ToString());

            var responseVector = vector.GetProperty("response");
            var signatureInput = responseVector.GetProperty("signature_input").GetString()!;
            var response = new HttpResponseMessage((HttpStatusCode)responseVector.GetProperty("status").GetInt32());
            response.Headers.TryAddWithoutValidation("Cache-Control", responseVector.GetProperty("cache_control").GetString());
            response.Headers.TryAddWithoutValidation("Signature-Input", signatureInput);
            response.Headers.TryAddWithoutValidation("Signature", SignV2Response(vector, signatureInput, targetUri, authority));
            return Task.FromResult(response);
        };
        try
        {
            var record = vector.GetProperty("record");
            await Pka.PerformHandshakeAsync(targetUri, record.GetProperty("k").GetString()!, string.Empty, TimeSpan.FromSeconds(1));
        }
        finally
        {
            Pka.FillRandomBytesForTesting = oldFill;
            Pka.NowUnixForTesting = oldNow;
            Pka.SendAsyncForTesting = oldSend;
        }
    }

    private static async Task RunV2VectorWithResponseAsync(Action<HttpResponseMessage, JsonElement> mutateResponse)
    {
        var vector = V2Vector();
        var nonce = Base64UrlDecode(vector.GetProperty("nonce").GetString()!);
        var oldFill = Pka.FillRandomBytesForTesting;
        var oldNow = Pka.NowUnixForTesting;
        var oldSend = Pka.SendAsyncForTesting;
        Pka.FillRandomBytesForTesting = bytes => Array.Copy(nonce, bytes, bytes.Length);
        Pka.NowUnixForTesting = () => vector.GetProperty("created").GetInt64();
        Pka.SendAsyncForTesting = (_, _) =>
        {
            var responseVector = vector.GetProperty("response");
            var response = new HttpResponseMessage((HttpStatusCode)responseVector.GetProperty("status").GetInt32());
            response.Headers.TryAddWithoutValidation("Cache-Control", responseVector.GetProperty("cache_control").GetString());
            response.Headers.TryAddWithoutValidation("Signature-Input", responseVector.GetProperty("signature_input").GetString());
            response.Headers.TryAddWithoutValidation("Signature", responseVector.GetProperty("signature").GetString());
            mutateResponse(response, vector);
            return Task.FromResult(response);
        };
        try
        {
            var record = vector.GetProperty("record");
            await Pka.PerformHandshakeAsync(record.GetProperty("u").GetString()!, record.GetProperty("k").GetString()!, string.Empty, TimeSpan.FromSeconds(1));
        }
        finally
        {
            Pka.FillRandomBytesForTesting = oldFill;
            Pka.NowUnixForTesting = oldNow;
            Pka.SendAsyncForTesting = oldSend;
        }
    }

    private static string SignV2Response(JsonElement vector, string signatureInput, string? targetUri = null, string? authority = null)
    {
        var seed = SeedFromVector(vector);
        var algorithm = SignatureAlgorithm.Ed25519;
        var key = Key.Import(algorithm, seed, KeyBlobFormat.RawPrivateKey);
        var signature = algorithm.Sign(key, BuildV2Base(vector, signatureInput, targetUri, authority));
        return $"aid-pka=:{Convert.ToBase64String(signature)}:";
    }

    private static byte[] BuildV2Base(JsonElement vector, string signatureInput, string? targetUri = null, string? authority = null)
    {
        var request = vector.GetProperty("request");
        var response = vector.GetProperty("response");
        var signatureParams = ExtractFirstAidPkaMember(signatureInput);
        var closeIndex = signatureParams.IndexOf(')', StringComparison.Ordinal);
        var coveredRaw = signatureParams[1..closeIndex].Trim();
        var lines = new List<string>();
        foreach (var item in SplitCoveredItemsForTest(coveredRaw))
        {
            var name = Regex.Match(item, "^\"([^\"]+)\"").Groups[1].Value.ToLowerInvariant();
            switch (name)
            {
                case "@method":
                    lines.Add($"{item}: {request.GetProperty("method").GetString()}");
                    break;
                case "@target-uri":
                    lines.Add($"{item}: {targetUri ?? request.GetProperty("target_uri").GetString()}");
                    break;
                case "@authority":
                    lines.Add($"{item}: {authority ?? request.GetProperty("authority").GetString()}");
                    break;
                case "@status":
                    lines.Add($"{item}: {response.GetProperty("status").GetInt32()}");
                    break;
                case "date":
                    lines.Add($"{item}: Tue, 30 Dec 2025 00:00:00 GMT");
                    break;
                case "aid-domain":
                    lines.Add($"{item}: {vector.GetProperty("domain").GetString()}");
                    break;
                default:
                    throw new InvalidOperationException($"Unsupported covered item in test helper: {item}");
            }
        }
        lines.Add($"\"@signature-params\": {signatureParams}");
        return Encoding.UTF8.GetBytes(string.Join('\n', lines));
    }

    private static string ReplaceV2CoveredList(string signatureInput, string coveredItems)
    {
        const string prefix = "aid-pka=(";
        var start = signatureInput.IndexOf(prefix, StringComparison.Ordinal) + prefix.Length;
        var end = signatureInput.IndexOf(')', start);
        return signatureInput[..start] + coveredItems + signatureInput[end..];
    }

    private static List<string> SplitCoveredItemsForTest(string input)
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

    private static string ExtractFirstAidPkaMember(string signatureInput)
    {
        const string label = "aid-pka=";
        var start = signatureInput.IndexOf(label, StringComparison.OrdinalIgnoreCase);
        if (start < 0)
        {
            throw new InvalidOperationException("Missing aid-pka member in test vector");
        }
        start += label.Length;
        var depth = 0;
        var inString = false;
        var inBytes = false;
        var escaped = false;
        for (int i = start; i < signatureInput.Length; i++)
        {
            var c = signatureInput[i];
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
                return signatureInput[start..i].Trim();
            }
        }
        return signatureInput[start..].Trim();
    }

    private static byte[] Base64UrlDecode(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded = padded.PadRight(padded.Length + (4 - padded.Length % 4) % 4, '=');
        return Convert.FromBase64String(padded);
    }
}
