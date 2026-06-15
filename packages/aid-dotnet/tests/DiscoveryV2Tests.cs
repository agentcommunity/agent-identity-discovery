using System.Reflection;

namespace AidDiscovery.Tests;

public class DiscoveryV2Tests
{
    private static AidRecord Select(IEnumerable<string> txts)
    {
        var method = typeof(Discovery).GetMethod("ParseSingleValid", BindingFlags.NonPublic | BindingFlags.Static)
            ?? throw new MissingMethodException("Discovery.ParseSingleValid");
        try
        {
            var result = method.Invoke(null, new object?[] { txts, TimeSpan.FromSeconds(1), "_agent.example.com", null })!;
            return ((ValueTuple<AidRecord, bool>)result).Item1;
        }
        catch (TargetInvocationException ex) when (ex.InnerException is not null)
        {
            throw ex.InnerException;
        }
    }

    [Fact]
    public void QueryNamesUseUnderscoreProtocolThenBase()
    {
        Assert.Equal(new[] { "_agent._mcp.example.com", "_agent.example.com" }, Discovery.QueryNames("example.com", "mcp"));
        Assert.DoesNotContain("_agent.mcp.example.com", Discovery.QueryNames("example.com", "mcp"));
    }

    [Fact]
    public void SelectionPrefersOneValidAid2OverAid1()
    {
        var rec = Select(new[]
        {
            "v=aid1;u=https://v1.example.com/mcp;p=mcp",
            "v=aid2;u=https://v2.example.com/mcp;p=mcp",
        });

        Assert.Equal("aid2", rec.V);
        Assert.Equal("https://v2.example.com/mcp", rec.Uri);
    }

    [Fact]
    public void SelectionFallsBackToAid1WhenAid2IsInvalid()
    {
        var rec = Select(new[]
        {
            "v=aid2;u=http://bad.example.com/mcp;p=mcp",
            "v=aid1;u=https://v1.example.com/mcp;p=mcp",
        });

        Assert.Equal("aid1", rec.V);
        Assert.Equal("https://v1.example.com/mcp", rec.Uri);
    }

    [Fact]
    public void SelectionAppliesAmbiguityWithinSelectedVersion()
    {
        var ex = Assert.Throws<AidError>(() => Select(new[]
        {
            "v=aid1;u=https://v1.example.com/mcp;p=mcp",
            "v=aid2;u=https://one.example.com/mcp;p=mcp",
            "v=aid2;u=https://two.example.com/mcp;p=mcp",
        }));

        Assert.Equal(nameof(Constants.ERR_INVALID_TXT), ex.ErrorCode);
    }

    [Fact]
    public void SelectionChoosesValidAid2WhenAnotherAid2IsMalformed()
    {
        var rec = Select(new[]
        {
            "v=aid2;u=http://bad.example.com/mcp;p=mcp",
            "v=aid2;u=https://good.example.com/mcp;p=mcp",
        });

        Assert.Equal("aid2", rec.V);
        Assert.Equal("https://good.example.com/mcp", rec.Uri);
    }

    [Fact]
    public void SelectionRejectsOnlyMalformedAidLikeTxt()
    {
        var ex = Assert.Throws<AidError>(() => Select(new[]
        {
            "v=aid3;u=https://future.example.com/mcp;p=mcp",
        }));

        Assert.Equal(nameof(Constants.ERR_INVALID_TXT), ex.ErrorCode);
    }
}
