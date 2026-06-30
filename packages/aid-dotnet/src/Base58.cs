using System.Numerics;

namespace AidDiscovery;

internal static class Base58
{
    private const string Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

    public static byte[] Decode(string s)
    {
        if (string.IsNullOrEmpty(s)) return Array.Empty<byte>();
        BigInteger n = BigInteger.Zero;
        foreach (char c in s)
        {
            int idx = Alphabet.IndexOf(c);
            if (idx < 0) throw new AidError(nameof(Constants.ERR_SECURITY), "Invalid base58 character");
            n = n * 58 + idx;
        }
        // Convert BigInteger to big-endian bytes. A zero value contributes no body
        // bytes (standard bitcoin-style Base58); only the leading-'1' zero bytes below
        // are emitted, so an all-'1' input decodes to exactly that many zero bytes.
        var bytes = n == BigInteger.Zero ? Array.Empty<byte>() : n.ToByteArray(isBigEndian: true, isUnsigned: true);
        // Add leading zero bytes for each leading '1'
        int leading = 0;
        foreach (char c in s)
        {
            if (c == '1') leading++; else break;
        }
        var result = new byte[leading + bytes.Length];
        Array.Copy(bytes, 0, result, leading, bytes.Length);
        return result;
    }
}

