# WHYDIFF

> **"Review the behavioral delta, not the code diff."**

WHYDIFF is a behavioral change detection and verification infrastructure. While Git highlights line-by-line textual changes and traditional unit tests assert expected outcomes, WHYDIFF observes and compares actual runtime behavior across Git revisions.

By executing equivalent HTTP probes against isolated baseline and candidate revisions, WHYDIFF captures runtime responses, detects breaking and risky differences, and produces reproducible evidence explaining what actually changed.

---

## 1. Product Philosophy

1. **Evidence over assumptions**: Every detected behavioral difference links directly to executed HTTP probes.
2. **Actual execution over speculative analysis**: No static guesswork; code is executed under controlled isolation.
3. **Reproducibility**: Analysis runs capture complete metadata, inputs, and outputs in structured JSON reports.
4. **Deterministic comparison**: Canonical JSON key ordering, volatile header filtering, and secret redaction eliminate false positives and leaks.
5. **Contract vs Runtime awareness**: Clear distinction between contract changes, runtime behavioral changes, and compatibility risks.
6. **Developer experience**: Clean terminal output with actionable severity rankings and verdict tags.

---

## 2. Prerequisites

- **Node.js**: >= 20.x or >= 22.x
- **Git**: >= 2.30
- **Package Manager**: pnpm (recommended) or npm

---

## 3. Installation

Install globally or as a project dev-dependency:

```bash
# Using pnpm
pnpm add -D whydiff

# Using npm
npm install --save-dev whydiff
```

---

## 4. Quick Start

### Step 1: Initialize WHYDIFF in your repository

```bash
whydiff init
```

This generates `.whydiff.toml` and `.whydiff/probes.json`.

### Step 2: Configure your Fastify application factory

Ensure your application entrypoint (e.g., `src/app.ts`) exports an asynchronous factory function:

```typescript
import Fastify from "fastify";

export async function buildApp() {
  const app = Fastify();

  app.get("/health", async () => {
    return { status: "ok" };
  });

  app.get("/users/:id", async (request) => {
    return {
      id: request.params.id,
      name: "Alice",
      email: "alice@example.com"
    };
  });

  return app;
}
```

### Step 3: Run Behavioral Diff

```bash
whydiff diff main..HEAD
```

---

## 5. Phase 1 Capabilities

### A. OpenAPI Contract Intelligence
WHYDIFF parses and compares OpenAPI 3.0 and 3.1 specifications in JSON or YAML format:
- Resolves internal `$ref` schema references and parameter pointers.
- Identifies breaking changes: removed endpoints, newly required request fields, removed response fields, incompatible type changes, removed status codes, and altered authentication requirements.
- Identifies compatible changes: added endpoints, relaxed requirements, and optional query parameters.

```bash
# Inspect an OpenAPI specification
whydiff contract inspect ./openapi.json
whydiff contract inspect ./openapi.yaml --json

# Compare two OpenAPI specifications
whydiff contract diff ./openapi-base.json ./openapi-cand.yaml
```

### B. Schema-Aware Probe Generation
WHYDIFF synthesizes deterministic HTTP probes directly from OpenAPI contracts:
- Generates valid happy-path requests matching schema constraints.
- Generates negative boundary probes (missing required fields, invalid types, enum violations).
- Automatically substitutes path parameters and required query parameters.

```bash
# Generate probes to stdout or disk
whydiff probe generate ./openapi.yaml
whydiff probe generate ./openapi.yaml --output .whydiff/probes.json
whydiff probe list
```

### C. Differential Probing
When comparing two revisions with OpenAPI contracts, WHYDIFF automatically generates targeted probes motivated by contract changes to confirm whether contract changes translate into actual runtime regressions.

```bash
whydiff diff main..HEAD --openapi-baseline ./openapi-v1.json --openapi-candidate ./openapi-v2.yaml
```

### D. Authentication & Authorization Profiles
Configure authentication schemes in `.whydiff.toml`:
- **Bearer Tokens**: `token = "${API_TOKEN}"` or `token = "env:API_TOKEN"`
- **API Keys**: `name = "x-api-key"`, `value = "${SECRET_KEY}"`, `in = "header"` or `"query"`
- **Basic Auth**: `username = "admin"`, `password = "${PASSWORD}"`
- **Custom Headers**: Injected custom authentication headers
- **Secret Redaction**: Automatic zero-leak sanitization in console logs, evidence records, and normalizers.

```bash
# Validate configured credentials
whydiff auth validate
whydiff auth validate staging
```

### E. HTTP Reliability & Error Semantics
- **Idempotency Protection**: Safe methods (`GET`, `HEAD`, `PUT`, `DELETE`, `OPTIONS`) are eligible for retry; non-idempotent methods (`POST`, `PATCH`) are protected against duplicate side effects unless explicitly configured.
- **Exponential Backoff**: Jittered exponential backoff handles transient network latency and server warmups.
- **Malformed JSON Handling**: Non-JSON payloads and HTML error pages are captured as raw strings without crashing.

---

## 6. CLI Command Reference

| Command | Description |
|---|---|
| `whydiff init [dir]` | Initialize `.whydiff.toml` and `.whydiff/probes.json` in the target directory |
| `whydiff diff <revisions>` | Run behavioral comparison between two Git revisions (e.g. `main..HEAD`) |
| `whydiff behavior <revisions>` | Run probes and output detailed technical comparison including payloads |
| `whydiff explain <delta-id>` | Display ground-truth evidence and breakdown for a specific delta |
| `whydiff report [--format=json]` | View or export the latest analysis run in terminal or JSON format |
| `whydiff ci [--fail-on=breaking]` | Execute behavioral diff in CI and enforce exit code policies |
| `whydiff contract inspect <spec>` | Inspect an OpenAPI 3.0 / 3.1 JSON or YAML specification |
| `whydiff contract diff <base> <cand>` | Compare two OpenAPI specifications and identify schema deltas |
| `whydiff probe generate <spec>` | Generate schema-derived HTTP probes from an OpenAPI specification |
| `whydiff probe list` | List configured probes in `.whydiff.toml` |
| `whydiff auth validate [profile]` | Validate authentication credentials and environment variable secrets |

---

## 7. Severity & Compatibility Verdicts

Deltas are ranked by severity:
- **BREAKING**: Previously successful (2xx) endpoint becomes an error, required field removed, or incompatible type change.
- **RISKY**: Status code changes within success range (e.g. 201 to 200).
- **CHANGED**: Safe value or header modifications.
- **INFORMATIONAL**: Compatible metadata changes.
- **UNVERIFIED**: Candidate endpoint timed out, crashed, or could not be verified.

Each delta is labeled with a **Compatibility Verdict**:
- `confirmed_regression`: Runtime execution confirmed a breaking behavioral regression.
- `contract_incompatibility`: Contract delta broke compatibility with client expectations.
- `runtime_divergence`: Runtime behavior diverged across revisions.
- `unverified_risk`: Failure or timeout prevented full verification.
- `compatible_behavior`: Change is safe and non-breaking.

---

## 8. CI Integration

Integrate WHYDIFF into GitHub Actions:

```yaml
name: Behavioral Verification

on:
  pull_request:
    branches: [main]

jobs:
  whydiff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install dependencies
        run: pnpm install

      - name: Run WHYDIFF CI
        run: pnpm exec whydiff ci --base=origin/main --candidate=HEAD --fail-on=breaking
```

### Standard Exit Codes:
- `0`: Analysis passed without breaking changes.
- `1`: Behavioral or contract regressions detected according to the configured policy.
- `2`: Configuration, Git, or analysis infrastructure error.

---

## 9. Current Scope & Roadmap

- **Phase 0 (Completed)**: Core execution engine, Fastify inject adapter, worktree isolation, delta classification, and reporting.
- **Phase 1 (Completed)**: OpenAPI 3.0/3.1 contract intelligence, schema-aware probe generation, authentication injection, secret redaction, and reliability retries.
- **Phase 2 (Upcoming)**: Express, NestJS, and Next.js application adapters; multi-step session workflows.
- **Phase 3**: Database state isolation and external mock recording / replay.
- **Phase 4**: Cryptographic evidence signing and behavioral verification attestations.
