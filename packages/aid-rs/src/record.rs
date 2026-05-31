#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AidRecord {
    pub v: String,
    pub uri: String,
    pub proto: String,
    pub auth: Option<String>,
    pub desc: Option<String>,
    pub docs: Option<String>,
    pub dep: Option<String>,
    pub pka: Option<String>,
    pub kid: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AidRecordV1 {
    pub v: String,
    pub uri: String,
    pub proto: String,
    pub auth: Option<String>,
    pub desc: Option<String>,
    pub docs: Option<String>,
    pub dep: Option<String>,
    pub pka: Option<String>,
    pub kid: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AidRecordV2 {
    pub v: String,
    pub uri: String,
    pub proto: String,
    pub auth: Option<String>,
    pub desc: Option<String>,
    pub docs: Option<String>,
    pub dep: Option<String>,
    pub pka: Option<String>,
}

impl AidRecord {
    pub fn as_v1(&self) -> Option<AidRecordV1> {
        if self.v != crate::constants_gen::SPEC_VERSION_V1 {
            return None;
        }

        Some(AidRecordV1 {
            v: self.v.clone(),
            uri: self.uri.clone(),
            proto: self.proto.clone(),
            auth: self.auth.clone(),
            desc: self.desc.clone(),
            docs: self.docs.clone(),
            dep: self.dep.clone(),
            pka: self.pka.clone(),
            kid: self.kid.clone(),
        })
    }

    pub fn as_v2(&self) -> Option<AidRecordV2> {
        if self.v != crate::constants_gen::SPEC_VERSION_V2 || self.kid.is_some() {
            return None;
        }

        Some(AidRecordV2 {
            v: self.v.clone(),
            uri: self.uri.clone(),
            proto: self.proto.clone(),
            auth: self.auth.clone(),
            desc: self.desc.clone(),
            docs: self.docs.clone(),
            dep: self.dep.clone(),
            pka: self.pka.clone(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants_gen::{
        AID_RECORD_V1_ALIAS_FIELDS, AID_RECORD_V1_CANONICAL_FIELDS, AID_RECORD_V2_ALIAS_FIELDS,
        AID_RECORD_V2_CANONICAL_FIELDS, SPEC_VERSION_V1, SPEC_VERSION_V2,
    };

    const V2_PKA: &str = "ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ";

    #[test]
    fn projects_legacy_and_current_records_to_versioned_contracts() {
        let legacy = AidRecord {
            v: SPEC_VERSION_V1.to_string(),
            uri: "https://api.example.com/mcp".to_string(),
            proto: "mcp".to_string(),
            auth: None,
            desc: None,
            docs: None,
            dep: None,
            pka: Some("z1111111111111111111111111111111111111111111".to_string()),
            kid: Some("g1".to_string()),
        };

        let v1 = legacy.as_v1().expect("aid1 projects as AidRecordV1");
        assert_eq!(v1.kid.as_deref(), Some("g1"));
        assert!(legacy.as_v2().is_none());

        let current = AidRecord {
            v: SPEC_VERSION_V2.to_string(),
            uri: "https://api.example.com/mcp".to_string(),
            proto: "mcp".to_string(),
            auth: None,
            desc: None,
            docs: None,
            dep: None,
            pka: Some(V2_PKA.to_string()),
            kid: None,
        };

        let v2 = current.as_v2().expect("aid2 without kid projects as AidRecordV2");
        assert_eq!(v2.pka.as_deref(), Some(V2_PKA));

        let mut invalid_v2 = current.clone();
        invalid_v2.kid = Some("legacy-kid".to_string());
        assert!(invalid_v2.as_v2().is_none());
    }

    #[test]
    fn generated_metadata_keeps_kid_out_of_aid2() {
        assert!(AID_RECORD_V1_CANONICAL_FIELDS.contains(&"kid"));
        assert!(AID_RECORD_V1_ALIAS_FIELDS.contains(&"i"));
        assert!(!AID_RECORD_V2_CANONICAL_FIELDS.contains(&"kid"));
        assert!(!AID_RECORD_V2_ALIAS_FIELDS.contains(&"i"));
    }
}
