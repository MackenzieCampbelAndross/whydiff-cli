# Changelog

All notable changes to WHYDIFF will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
