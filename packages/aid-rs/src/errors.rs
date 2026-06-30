use std::error::Error;
use std::fmt::{self, Display, Formatter};

use crate::constants_gen::{
    ERR_DNS_LOOKUP_FAILED, ERR_FALLBACK_FAILED, ERR_INVALID_TXT, ERR_NO_RECORD, ERR_SECURITY,
    ERR_UNSUPPORTED_PROTO,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AidError {
    pub code: u16,
    pub error_code: &'static str,
    pub message: String,
}

impl AidError {
    pub fn new(error_code: &'static str, message: impl Into<String>) -> Self {
        let code = match error_code {
            "ERR_NO_RECORD" => ERR_NO_RECORD,
            "ERR_INVALID_TXT" => ERR_INVALID_TXT,
            "ERR_UNSUPPORTED_PROTO" => ERR_UNSUPPORTED_PROTO,
            "ERR_SECURITY" => ERR_SECURITY,
            "ERR_DNS_LOOKUP_FAILED" => ERR_DNS_LOOKUP_FAILED,
            "ERR_FALLBACK_FAILED" => ERR_FALLBACK_FAILED,
            _ => ERR_INVALID_TXT,
        };
        Self {
            code,
            error_code,
            message: message.into(),
        }
    }

    pub fn invalid_txt(message: impl Into<String>) -> Self {
        Self::new("ERR_INVALID_TXT", message)
    }

    pub fn unsupported_proto(message: impl Into<String>) -> Self {
        Self::new("ERR_UNSUPPORTED_PROTO", message)
    }
}

impl Display for AidError {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({}): {}", self.error_code, self.code, self.message)
    }
}

impl Error for AidError {}
