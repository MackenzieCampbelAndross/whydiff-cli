# Changelog

All notable changes to WHYDIFF will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-18

### Added
- **OpenAPI Contract Intelligence**:
  - Full support for OpenAPI 3.0 and 3.1 specifications in JSON and YAML formats.
  - Parser with internal JSON pointer (`$ref`) schema and parameter resolution.
  - OpenAPI spec inspector extracting endpoints, operation summaries, security schemes, request bodies, and responses.
  - Contract differ detecting breaking changes: removed endpoints, added required request fields, removed response fields, incompatible type changes, and altered authentication schemes.
  - Contract differ detecting compatible changes: added endpoints, relaxed requirements, and optional query parameters.
- **Schema-Aware Probe Generation**:
  - Deterministic HTTP probe generation from OpenAPI paths and methods.
  - Sampling valid JSON request payloads matching types, min/max limits, enums, and nested structures.
  - Path and query parameter substitution with sampled values.
  - Negative error probe generation: missing required fields, type violations, and enum violations.
  - Differential probe generation motivated by OpenAPI contract deltas.
- **Authentication & Authorization**:
  - Support for Bearer token, API Key (header/query), Basic auth, and custom headers.
  - Environment variable resolution supporting `${VAR}` and `env:VAR` syntax.
  - Automatic centralized secret redaction in normalizer, evidence store, and CLI output.
- **HTTP Reliability & Error Semantics**:
  - Idempotency classification protecting non-idempotent methods (`POST`, `PATCH`) from unsafe retries.
  - Exponential backoff calculation with delay caps for transient error recovery (502, 503, 504, network timeouts).
  - Malformed JSON handling: raw body preservation without runtime parser crashes.
  - Per-probe retry logs and attempt tracking.
- **Classification & Compatibility Verdicts**:
  - Added `unverified` severity classification for timed-out or unverified endpoints.
  - Added compatibility verdicts: `confirmed_regression`, `contract_incompatibility`, `runtime_divergence`, `unverified_risk`, and `compatible_behavior`.
- **CLI Commands**:
  - `whydiff contract inspect <spec-path> [--json]`
  - `whydiff contract diff <baseline-spec> <candidate-spec> [--json]`
  - `whydiff probe generate <spec-path> [-o <path>] [--valid-only] [--invalid-only] [--limit <n>] [--json]`
  - `whydiff probe list [-c <config>] [--json]`
  - `whydiff auth validate [profile] [-c <config>] [--json]`
  - Updated `whydiff diff`, `whydiff behavior`, and `whydiff ci` with `--openapi-baseline`, `--openapi-candidate`, and `--auth-profile` options.
- **Demonstration API Expansion**:
  - Baseline (`openapi-baseline.json`, OpenAPI 3.0.3) and Candidate (`openapi-candidate.yaml`, OpenAPI 3.1.0) contracts.
  - Protected route (`/secure/profile`) demonstrating contract vs runtime divergence.

## [0.1.0] - 2026-11-18

### Added
- **Core Behavioral Engine**:
  - TOML configuration engine with Zod schema validation.
  - Native Git worktree isolation with safe subprocess execution.
  - HTTP probe engine supporting headers, query params, and JSON payloads.
  - Fastify application adapter utilizing `inject()` for in-process HTTP dispatch.
  - Normalized observation model with recursive JSON canonicalization and sensitive header redaction.
  - Deep comparison engine detecting status code, header, body field, value, and type changes.
  - Deterministic severity classification: `breaking`, `risky`, `changed`, and `informational`.
  - Structured evidence engine writing `.whydiff/reports/<run-id>/` JSON artifacts.
- **Command Line Interface**:
  - `whydiff init`: Initialize `.whydiff.toml` and `.whydiff/probes.json`.
  - `whydiff diff <revisions>`: Primary behavioral diff command with formatted terminal output.
  - `whydiff behavior <revisions>`: Detailed technical probe comparison with latencies and payloads.
  - `whydiff explain <delta-id>`: Ground truth evidence breakdown for individual deltas.
  - `whydiff report`: Export and format previous run reports in terminal or JSON formats.
  - `whydiff ci`: Automated CI policy verification with standard exit codes.
- **Demonstration API**:
  - Complete Fastify regression demonstration repository with 6 canonical behavioral scenarios.
  - Automated fixture generation script for reproducible testing.
