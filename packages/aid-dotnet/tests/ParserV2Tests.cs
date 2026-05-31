namespace AidDiscovery.Tests;

public class ParserV2Tests
{
    private const string ValidV2Key = "ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ";

    [Fact]
    public void ParseAcceptsAid1WithLegacyPkaAndKid()
    {
        var rec = Aid.Parse("v=aid1;u=https://api.example.com/mcp;p=mcp;k=z1111111111111111111111111111111111111111111;i=g1");

        Assert.Equal("aid1", rec.V);
        Assert.Equal("z1111111111111111111111111111111111111111111", rec.Pka);
        Assert.Equal("g1", rec.Kid);
    }

    [Fact]
    public void ParseAcceptsAid2UnpaddedBase64UrlPkaWithoutKid()
    {
        var rec = Aid.Parse($"v=aid2;u=https://api.example.com/mcp;p=mcp;k={ValidV2Key}");

        Assert.Equal("aid2", rec.V);
        Assert.Equal(ValidV2Key, rec.Pka);
        Assert.Null(rec.Kid);
    }

    [Fact]
    public void ParseAcceptsAid2PkaAliasWithoutKid()
    {
        var rec = Aid.Parse($"v=aid2;u=https://api.example.com/mcp;p=mcp;pka={ValidV2Key}");

        Assert.Equal("aid2", rec.V);
        Assert.Equal(ValidV2Key, rec.Pka);
        Assert.Null(rec.Kid);
    }

    [Fact]
    public void ParseRejectsAid1PkaWithoutKid()
    {
        var ex = Assert.Throws<AidError>(() => Aid.Parse("v=aid1;u=https://api.example.com/mcp;p=mcp;k=z1111111111111111111111111111111111111111111"));

        Assert.Equal(nameof(Constants.ERR_INVALID_TXT), ex.ErrorCode);
    }

    [Theory]
    [InlineData("kid=g1")]
    [InlineData("i=g1")]
    public void ParseRejectsAid2Kid(string kidField)
    {
        var ex = Assert.Throws<AidError>(() => Aid.Parse($"v=aid2;u=https://api.example.com/mcp;p=mcp;k={ValidV2Key};{kidField}"));

        Assert.Equal(nameof(Constants.ERR_INVALID_TXT), ex.ErrorCode);
    }

    [Theory]
    [InlineData("kid=g1")]
    [InlineData("i=g1")]
    public void ParseRejectsAid2KidEvenWithoutPka(string kidField)
    {
        var ex = Assert.Throws<AidError>(() => Aid.Parse($"v=aid2;u=https://api.example.com/mcp;p=mcp;{kidField}"));

        Assert.Equal(nameof(Constants.ERR_INVALID_TXT), ex.ErrorCode);
    }

    [Theory]
    [InlineData("z1111111111111111111111111111111111111111111")]
    [InlineData("ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ=")]
    [InlineData("ebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ")]
    [InlineData("ebVWLo+mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ")]
    [InlineData("ebVWLo$mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ")]
    [InlineData("AAAA")]
    public void ParseRejectsInvalidAid2Pka(string key)
    {
        var ex = Assert.Throws<AidError>(() => Aid.Parse($"v=aid2;u=https://api.example.com/mcp;p=mcp;k={key}"));

        Assert.Equal(nameof(Constants.ERR_INVALID_TXT), ex.ErrorCode);
    }

    [Fact]
    public void AidRecordExposesVersionedContractProjections()
    {
        var legacy = new AidRecord(
            Constants.SpecVersionV1,
            "https://api.example.com/mcp",
            "mcp",
            pka: "z1111111111111111111111111111111111111111111",
            kid: "g1");

        var v1 = Assert.IsType<AidRecordV1>(legacy.AsV1());
        Assert.Equal("g1", v1.Kid);
        Assert.Null(legacy.AsV2());

        var current = new AidRecord(
            Constants.SpecVersionV2,
            "https://api.example.com/mcp",
            "mcp",
            pka: ValidV2Key);

        var v2 = Assert.IsType<AidRecordV2>(current.AsV2());
        Assert.Equal(ValidV2Key, v2.Pka);

        var invalidV2 = new AidRecord(
            Constants.SpecVersionV2,
            "https://api.example.com/mcp",
            "mcp",
            pka: ValidV2Key,
            kid: "legacy-kid");
        Assert.Null(invalidV2.AsV2());

        Assert.Contains("kid", Constants.AidRecordV1CanonicalFields);
        Assert.Contains("i", Constants.AidRecordV1AliasFields);
        Assert.DoesNotContain("kid", Constants.AidRecordV2CanonicalFields);
        Assert.DoesNotContain("i", Constants.AidRecordV2AliasFields);
    }
}
