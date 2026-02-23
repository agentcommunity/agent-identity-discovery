namespace AidDiscovery.Tests;

public class ErrorTests
{
    [Theory]
    [InlineData("v=aid1;uri=https://api.example.com/mcp;proto=unknown", "ERR_UNSUPPORTED_PROTO", nameof(Constants.ERR_UNSUPPORTED_PROTO))]
    public void UnsupportedProto(string txt, string expectedSymbol, string expectedConstName)
    {
        var ex = Assert.Throws<AidError>(() => Aid.Parse(txt));
        Assert.Equal(expectedSymbol, ex.ErrorCode);
        Assert.Equal((int)typeof(Constants).GetField(expectedConstName)!.GetRawConstantValue()!, ex.Code);
    }

    [Fact]
    public void MissingRequiredFields()
    {
        var ex1 = Assert.Throws<AidError>(() => Aid.Parse("uri=https://x;y=z"));
        Assert.Equal("ERR_INVALID_TXT", ex1.ErrorCode);
        var ex2 = Assert.Throws<AidError>(() => Aid.Parse("v=aid1;proto=mcp"));
        Assert.Equal("ERR_INVALID_TXT", ex2.ErrorCode);
        var ex3 = Assert.Throws<AidError>(() => Aid.Parse("v=aid1;uri=https://x"));
        Assert.Equal("ERR_INVALID_TXT", ex3.ErrorCode);
    }

    [Fact]
    public void VersionLongKeyCompatibility()
    {
        var rec = Aid.Parse("version=aid1;u=https://api.example.com/mcp;proto=mcp");
        Assert.Equal("aid1", rec.V);
        Assert.Equal("mcp", rec.Proto);
    }

    [Fact]
    public void VersionAndVDuplicateRejected()
    {
        var ex = Assert.Throws<AidError>(() => Aid.Parse("v=aid1;version=aid1;u=https://api.example.com/mcp;p=mcp"));
        Assert.Equal("ERR_INVALID_TXT", ex.ErrorCode);
    }

    [Fact]
    public void BothProtoAndAlias()
    {
        var ex = Assert.Throws<AidError>(() => Aid.Parse("v=aid1;uri=https://x;proto=mcp;p=mcp"));
        Assert.Equal("ERR_INVALID_TXT", ex.ErrorCode);
    }

    [Fact]
    public void InvalidHttpsScheme()
    {
        var ex = Assert.Throws<AidError>(() => Aid.Parse("v=aid1;uri=http://api.example.com;mcp;proto=mcp"));
        Assert.Equal("ERR_INVALID_TXT", ex.ErrorCode);
    }

    [Fact]
    public void RemoteHttpLoopbackIsRejected()
    {
        var ex = Assert.Throws<AidError>(() => Aid.Parse("v=aid1;uri=http://localhost:8080/mcp;proto=mcp"));
        Assert.Equal("ERR_INVALID_TXT", ex.ErrorCode);
    }

    [Fact]
    public void LocalInvalidScheme()
    {
        var ex = Assert.Throws<AidError>(() => Aid.Parse("v=aid1;uri=foo://bar;proto=local"));
        Assert.Equal("ERR_INVALID_TXT", ex.ErrorCode);
    }

    [Fact]
    public void InvalidAuthToken()
    {
        var ex = Assert.Throws<AidError>(() => Aid.Parse("v=aid1;uri=https://api.example.com;mcp;proto=mcp;auth=xyz"));
        Assert.Equal("ERR_INVALID_TXT", ex.ErrorCode);
    }

    [Fact]
    public void TooLongDesc()
    {
        var longDesc = new string('a', 61);
        var ex = Assert.Throws<AidError>(() => Aid.Parse($"v=aid1;uri=https://api.example.com;mcp;proto=mcp;desc={longDesc}"));
        Assert.Equal("ERR_INVALID_TXT", ex.ErrorCode);
    }
}
