# CI Setup Notes

This document explains how CI is configured and why certain checks always run.

## The Problem

Previously, every `push` or `pull_request` triggered all CI workflows (TypeScript, Go, Java, Python, Rust, .NET, etc.), regardless of which files were actually modified. This resulted in:

- Long queue times.
- Wasted GitHub Actions minutes.
- Delayed feedback for simple changes.

## Current Setup (Required Checks)

Branch protection requires the language CI jobs to report on every PR. As a result, the language workflows run on all PRs and pushes, even for web-only changes.

Secret scanning uses diff mode on PRs and pushes to avoid base and head being the same commit. Scheduled and manual runs scan the full repository.

### Optimization Matrix

| Workflow            | Trigger Behavior                                                                   |
| ------------------- | ---------------------------------------------------------------------------------- |
| **CI (TypeScript)** | Runs on all PRs and pushes (required)                                              |
| **CI (Go)**         | Runs on all PRs and pushes (required)                                              |
| **CI (Java)**       | Runs on all PRs and pushes (required)                                              |
| **CI (Python)**     | Runs on all PRs and pushes (required)                                              |
| **CI (Rust)**       | Runs on all PRs and pushes (required)                                              |
| **CI (.NET)**       | Runs on all PRs and pushes (required)                                              |
| **Parity Check**    | Runs on all PRs and pushes to main (no path filter; required by branch protection) |
| **Security Scan**   | Diff scan on PRs and pushes. Full scan on schedule or manual runs.                 |

## Result

- **Frontend changes** now trigger all language CI jobs due to required checks.
- **SDK-specific changes** still run their native CI plus parity and security scans.
- **Protocol changes** continue to trigger everything for conformity.
