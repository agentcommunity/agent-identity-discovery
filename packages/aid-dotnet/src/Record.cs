namespace AidDiscovery;

public sealed class AidRecord
{
    public string V { get; }
    public string Uri { get; }
    public string Proto { get; }
    public string? Auth { get; }
    public string? Desc { get; }
    public string? Docs { get; }
    public string? Dep { get; }
    public string? Pka { get; }
    public string? Kid { get; }

    public AidRecord(string v, string uri, string proto, string? auth = null, string? desc = null, string? docs = null, string? dep = null, string? pka = null, string? kid = null)
    {
        V = v;
        Uri = uri;
        Proto = proto;
        Auth = auth;
        Desc = desc;
        Docs = docs;
        Dep = dep;
        Pka = pka;
        Kid = kid;
    }

    public AidRecordV1? AsV1()
    {
        if (V != Constants.SpecVersionV1)
        {
            return null;
        }

        return new AidRecordV1(V, Uri, Proto, Auth, Desc, Docs, Dep, Pka, Kid);
    }

    public AidRecordV2? AsV2()
    {
        if (V != Constants.SpecVersionV2 || Kid is not null)
        {
            return null;
        }

        return new AidRecordV2(V, Uri, Proto, Auth, Desc, Docs, Dep, Pka);
    }
}

public sealed class AidRecordV1
{
    public string V { get; }
    public string Uri { get; }
    public string Proto { get; }
    public string? Auth { get; }
    public string? Desc { get; }
    public string? Docs { get; }
    public string? Dep { get; }
    public string? Pka { get; }
    public string? Kid { get; }

    public AidRecordV1(string v, string uri, string proto, string? auth = null, string? desc = null, string? docs = null, string? dep = null, string? pka = null, string? kid = null)
    {
        V = v;
        Uri = uri;
        Proto = proto;
        Auth = auth;
        Desc = desc;
        Docs = docs;
        Dep = dep;
        Pka = pka;
        Kid = kid;
    }
}

public sealed class AidRecordV2
{
    public string V { get; }
    public string Uri { get; }
    public string Proto { get; }
    public string? Auth { get; }
    public string? Desc { get; }
    public string? Docs { get; }
    public string? Dep { get; }
    public string? Pka { get; }

    public AidRecordV2(string v, string uri, string proto, string? auth = null, string? desc = null, string? docs = null, string? dep = null, string? pka = null)
    {
        V = v;
        Uri = uri;
        Proto = proto;
        Auth = auth;
        Desc = desc;
        Docs = docs;
        Dep = dep;
        Pka = pka;
    }
}
