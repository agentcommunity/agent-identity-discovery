package org.agentcommunity.aid;

import java.util.Optional;

public final class AidRecord {
  public final String v;
  public final String uri;
  public final String proto;
  public final String auth; // nullable
  public final String desc; // nullable
  public final String docs; // nullable
  public final String dep;  // nullable
  public final String pka;  // nullable
  public final String kid;  // nullable

  public AidRecord(String v, String uri, String proto, String auth, String desc, String docs, String dep, String pka, String kid) {
    this.v = v;
    this.uri = uri;
    this.proto = proto;
    this.auth = auth;
    this.desc = desc;
    this.docs = docs;
    this.dep = dep;
    this.pka = pka;
    this.kid = kid;
  }

  /** Projects the compatibility record into the aid1-specific contract. */
  public Optional<AidRecordV1> asV1() {
    if (!Constants.SPEC_VERSION_V1.equals(v)) {
      return Optional.empty();
    }
    return Optional.of(new AidRecordV1(v, uri, proto, auth, desc, docs, dep, pka, kid));
  }

  /**
   * Projects the compatibility record into the aid2-specific contract.
   * Records carrying legacy DNS kid/i are refused because aid2 does not include DNS kid.
   */
  public Optional<AidRecordV2> asV2() {
    if (!Constants.SPEC_VERSION_V2.equals(v) || kid != null) {
      return Optional.empty();
    }
    return Optional.of(new AidRecordV2(v, uri, proto, auth, desc, docs, dep, pka));
  }

  public static final class AidRecordV1 {
    public final String v;
    public final String uri;
    public final String proto;
    public final String auth; // nullable
    public final String desc; // nullable
    public final String docs; // nullable
    public final String dep;  // nullable
    public final String pka;  // nullable
    public final String kid;  // nullable

    public AidRecordV1(String v, String uri, String proto, String auth, String desc, String docs, String dep, String pka, String kid) {
      this.v = v;
      this.uri = uri;
      this.proto = proto;
      this.auth = auth;
      this.desc = desc;
      this.docs = docs;
      this.dep = dep;
      this.pka = pka;
      this.kid = kid;
    }
  }

  public static final class AidRecordV2 {
    public final String v;
    public final String uri;
    public final String proto;
    public final String auth; // nullable
    public final String desc; // nullable
    public final String docs; // nullable
    public final String dep;  // nullable
    public final String pka;  // nullable

    public AidRecordV2(String v, String uri, String proto, String auth, String desc, String docs, String dep, String pka) {
      this.v = v;
      this.uri = uri;
      this.proto = proto;
      this.auth = auth;
      this.desc = desc;
      this.docs = docs;
      this.dep = dep;
      this.pka = pka;
    }
  }
}
