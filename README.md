# WHYDIFF

> **"Review the behavioral delta, not the code diff."**

WHYDIFF is a behavioral change detection and verification infrastructure. While Git highlights line-by-line textual changes and traditional unit tests assert expected outcomes, WHYDIFF observes and compares actual runtime behavior across Git revisions.

By executing equivalent HTTP probes against isolated baseline and candidate revisions, WHYDIFF captures runtime responses, detects breaking and risky differences, and produces reproducible evidence explaining what actually changed.

---

## 1. Product Philosophy

1. **Evidence over assumptions**: Every detected behavioral difference links directly to executed HTTP probes.
2. **Actual execution over speculative analysis**: No static guesswork; code is executed under controlled isolation.
3. **Reproducibility**: Analysis runs capture complete metadata, inputs, and outputs in structured JSON reports.
4. **Deterministic comparison**: Canonical JSON key ordering and volatile header filtering eliminate false positives.
5. **Developer experience**: Clean terminal output with actionable severity rankings.

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

### Step 3: Define HTTP Probes in `.whydiff/probes.json`

```json
{
  "probes": [
    {
      "id": "health-check",
      "name": "Health check",
      "method": "GET",
      "path": "/health"
    },
    {
      "id": "get-user",
      "name": "Retrieve user profile",
      "method": "GET",
      "path": "/users/123"
    }
  ]
}
```

### Step 4: Run Behavioral Diff

```bash
whydiff diff main..HEAD
```

---

## 5. CLI Command Reference

| Command | Description |
|---|---|
| `whydiff init [dir]` | Initialize a `.whydiff.toml` and `.whydiff/probes.json` in the target directory |
| `whydiff diff <revisions>` | Run behavioral comparison between two Git revisions (e.g. `main..HEAD`) |
| `whydiff behavior <revisions>` | Run probes and output detailed technical comparison including payloads |
| `whydiff explain <delta-id>` | Display ground-truth evidence and breakdown for a specific delta |
| `whydiff report [--format=json]` | View or export the latest analysis run in terminal or JSON format |
| `whydiff ci [--fail-on=breaking]` | Execute behavioral diff in CI and enforce exit code policies |

---

## 6. Severity Classification

- **BREAKING**:
  - Previously successful (2xx) endpoint becomes an error (4xx / 5xx) or fails.
  - A required response field is removed from a successful response.
  - A response field changes data types (e.g., `number` to `string`).
- **RISKY**:
  - HTTP status code changes within the successful range (e.g., `201` to `200`).
- **CHANGED**:
  - Response field value altered.
  - Response header changed (e.g. `cache-control`).
  - Optional response field added.
- **INFORMATIONAL**:
  - Minor non-breaking additions or configuration-level changes.

---

## 7. CI Integration

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
- `1`: Behavioral regressions detected according to the configured `--fail-on` policy.
- `2`: Configuration, Git, or analysis infrastructure error.

---

## 8. Current Limitations (Phase 0)

1. **Framework Support**: Fastify is the only supported framework in Phase 0.
2. **Surface**: HTTP request/response inspection via Fastify `inject()`.
3. **Probes**: Configured manually in `.whydiff/probes.json`.
4. **Source Attribution**: Mapping deltas to exact lines of code is reserved for future phases.

---

## 9. Roadmap

- **Phase 1**: Automated probe synthesis and OpenAPI / TypeScript schema inference.
- **Phase 2**: Express, NestJS, and Next.js application adapters.
- **Phase 3**: Database state isolation and external mock recording / replay.
- **Phase 4**: Cryptographic evidence signing and behavioral verification attestations.
