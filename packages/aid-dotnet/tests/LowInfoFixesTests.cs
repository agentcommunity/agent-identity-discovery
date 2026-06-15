namespace AidDiscovery.Tests;

// Covers the LOW/INFO review fixes that previously had no test coverage:
// - Base58 all-zero ('1') decoding length (dotnet-4)
// - well-known / discovery deprecation-expiry enforcement (dotnet-9)
public class LowInfoFixesTests
{
    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(32)]
    [InlineData(43)]
    public void Base58DecodeAllOnesProducesExactZeroByteCount(int count)
    {
        var input = new string('1', count);
        var decoded = Base58.Decode(input);
        // Standard bitcoin-style Base58: N '1' chars decode to exactly N zero bytes,
        // not N+1. (Previously produced N+1 because a zero body byte was added too.)
        Assert.Equal(count, decoded.Length);
        Assert.All(decoded, b => Assert.Equal(0, b));
    }

    [Fact]
    public void Base58DecodeMixedLeadingOnesKeepsLeadingZeros()
    {
        // '1' (zero) + '2' (value 1) -> one leading zero byte + 0x01.
        var decoded = Base58.Decode("12");
        Assert.Equal(new byte[] { 0, 1 }, decoded);
    }

    [Fact]
    public void EnforceDepExpiryThrowsForPastDeprecationDate()
    {
        var past = DateTimeOffset.UtcNow.AddDays(-1).ToString("yyyy-MM-dd'T'HH:mm:ss'Z'");
        var record = new AidRecord("aid2", "https://api.example.com/mcp", "mcp", dep: past);

        var ex = Assert.Throws<AidError>(() => Discovery.EnforceDepExpiry(record, "_agent.example.com"));
        Assert.Equal(nameof(Constants.ERR_INVALID_TXT), ex.ErrorCode);
        Assert.Contains("deprecated", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void EnforceDepExpiryAllowsFutureDeprecationDate()
    {
        var future = DateTimeOffset.UtcNow.AddDays(30).ToString("yyyy-MM-dd'T'HH:mm:ss'Z'");
        var record = new AidRecord("aid2", "https://api.example.com/mcp", "mcp", dep: future);

        // Future deprecation is a (non-fatal) warning, not an error.
        Discovery.EnforceDepExpiry(record, "_agent.example.com");
    }

    [Fact]
    public void EnforceDepExpiryNoOpWhenNoDep()
    {
        var record = new AidRecord("aid2", "https://api.example.com/mcp", "mcp");
        Discovery.EnforceDepExpiry(record, "_agent.example.com");
    }
}
