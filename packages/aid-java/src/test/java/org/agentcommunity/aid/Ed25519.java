package org.agentcommunity.aid;

import java.math.BigInteger;
import java.security.MessageDigest;
import java.util.Arrays;

/**
 * Minimal, self-contained Ed25519 public-key-from-seed derivation for tests only.
 *
 * <p>The JDK can sign with an Ed25519 private key built from a 32-byte seed (via PKCS#8), but it
 * does not expose the matching raw public key. The shared PKA vectors only carry the seed, so the
 * V1 handshake test must derive the public key to build the {@code z<base58>} multibase PKA that the
 * production verifier checks against. This implements the standard RFC 8032 construction:
 * {@code A = clamp(SHA-512(seed)[0:32]) * B}, encoded as 32 little-endian bytes with the x sign bit.
 *
 * <p>This is reference code optimised for clarity, not speed, and is NOT used by production.
 */
final class Ed25519 {
  private Ed25519() {}

  private static final BigInteger P =
      BigInteger.TWO.pow(255).subtract(BigInteger.valueOf(19)); // 2^255 - 19
  private static final BigInteger D =
      BigInteger.valueOf(-121665)
          .multiply(BigInteger.valueOf(121666).modInverse(P))
          .mod(P);
  private static final BigInteger BY =
      BigInteger.valueOf(4).multiply(BigInteger.valueOf(5).modInverse(P)).mod(P);
  private static final BigInteger BX = recoverX(BY);
  private static final BigInteger[] B = new BigInteger[] {BX, BY};

  static byte[] publicKeyFromSeed(byte[] seed) {
    if (seed.length != 32) throw new IllegalArgumentException("seed must be 32 bytes");
    byte[] h = sha512(seed);
    byte[] aBytes = Arrays.copyOfRange(h, 0, 32);
    aBytes[0] &= (byte) 0xf8;
    aBytes[31] &= (byte) 0x7f;
    aBytes[31] |= (byte) 0x40;
    BigInteger a = leToBigInteger(aBytes);
    BigInteger[] aPoint = scalarMul(B, a);
    return encodePoint(aPoint);
  }

  private static BigInteger recoverX(BigInteger y) {
    BigInteger y2 = y.multiply(y).mod(P);
    BigInteger u = y2.subtract(BigInteger.ONE).mod(P);
    BigInteger v = D.multiply(y2).add(BigInteger.ONE).mod(P);
    BigInteger uv3 = u.multiply(v.modPow(BigInteger.valueOf(3), P)).mod(P);
    BigInteger uv7 = u.multiply(v.modPow(BigInteger.valueOf(7), P)).mod(P);
    BigInteger x = uv3.multiply(uv7.modPow(P.subtract(BigInteger.valueOf(5)).divide(BigInteger.valueOf(8)), P)).mod(P);
    BigInteger vx2 = v.multiply(x).multiply(x).mod(P);
    if (!vx2.equals(u.mod(P))) {
      if (vx2.equals(u.negate().mod(P))) {
        BigInteger sqrtm1 = BigInteger.TWO.modPow(P.subtract(BigInteger.ONE).divide(BigInteger.valueOf(4)), P);
        x = x.multiply(sqrtm1).mod(P);
      }
    }
    if (x.testBit(0)) x = P.subtract(x);
    return x;
  }

  // Twisted Edwards point addition on -x^2 + y^2 = 1 + d x^2 y^2.
  private static BigInteger[] edwardsAdd(BigInteger[] p, BigInteger[] q) {
    BigInteger x1 = p[0], y1 = p[1], x2 = q[0], y2 = q[1];
    BigInteger dxy = D.multiply(x1).multiply(x2).multiply(y1).multiply(y2).mod(P);
    BigInteger x3 =
        x1.multiply(y2).add(x2.multiply(y1)).multiply(BigInteger.ONE.add(dxy).modInverse(P)).mod(P);
    BigInteger y3 =
        y1.multiply(y2)
            .add(x1.multiply(x2))
            .multiply(BigInteger.ONE.subtract(dxy).modInverse(P))
            .mod(P);
    return new BigInteger[] {x3, y3};
  }

  private static BigInteger[] scalarMul(BigInteger[] point, BigInteger scalar) {
    BigInteger[] result = new BigInteger[] {BigInteger.ZERO, BigInteger.ONE}; // identity
    BigInteger[] addend = point;
    BigInteger s = scalar;
    while (s.signum() > 0) {
      if (s.testBit(0)) result = edwardsAdd(result, addend);
      addend = edwardsAdd(addend, addend);
      s = s.shiftRight(1);
    }
    return result;
  }

  private static byte[] encodePoint(BigInteger[] point) {
    BigInteger x = point[0];
    BigInteger y = point[1];
    byte[] out = bigIntegerToLe(y, 32);
    if (x.testBit(0)) {
      out[31] |= (byte) 0x80;
    }
    return out;
  }

  private static BigInteger leToBigInteger(byte[] le) {
    byte[] be = new byte[le.length];
    for (int i = 0; i < le.length; i++) be[i] = le[le.length - 1 - i];
    return new BigInteger(1, be);
  }

  private static byte[] bigIntegerToLe(BigInteger value, int length) {
    byte[] out = new byte[length];
    BigInteger v = value;
    BigInteger mask = BigInteger.valueOf(0xff);
    for (int i = 0; i < length; i++) {
      out[i] = (byte) v.and(mask).intValue();
      v = v.shiftRight(8);
    }
    return out;
  }

  private static byte[] sha512(byte[] data) {
    try {
      return MessageDigest.getInstance("SHA-512").digest(data);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }
}
