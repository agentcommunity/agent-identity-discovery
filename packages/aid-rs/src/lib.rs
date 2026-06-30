//! Agent Identity & Discovery (AID) parser, discovery, and optional PKA handshake.
//!
//! The crate-level documentation below is sourced from `README.md` and is compiled
//! as a doctest under `--features handshake`, so the public-API examples in the README
//! are checked by CI and cannot silently drift out of sync with the code.
#![cfg_attr(feature = "handshake", doc = include_str!("../README.md"))]

pub mod errors;
pub mod parser;
pub mod record;

pub mod constants_gen;

pub use errors::AidError;
pub use parser::parse;
pub use record::AidRecord;

#[cfg(feature = "handshake")]
pub mod pka;

#[cfg(feature = "handshake")]
pub use pka::perform_pka_handshake;

pub mod well_known;

pub use well_known::{fetch_well_known, fetch_well_known_result, WellKnownResult};

pub mod discover;
pub use discover::{
    discover, discover_result, discover_with_options, discover_with_options_result,
    DiscoveryOptions, DiscoveryResult,
};
