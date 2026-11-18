# WHYDIFF Testing & Benchmark Methodology

## Test Suites Overview

WHYDIFF Phase 0 enforces comprehensive automated testing across five key dimensions:

1. **Unit Tests (`tests/unit/`)**:
   - Configuration TOML parsing & Zod schema validation
   - Probes parsing, validation, duplicate rejection, deterministic ordering
   - Git revision range parsing and SHA resolution
   - Normalization: JSON key canonicalization, header filtering, sensitive header redaction
   - Deep observation diffing (status, headers, body values, types, arrays, errors)
   - Delta classification heuristics and stable identifier assignment
   - Reporting formatting (terminal tables, banner, explain views)
   - CLI error hierarchy and exit code mapping

2. **Integration Tests (`tests/integration/`)**:
   - Git worktree creation and safe cleanup without touching the user's active branch
   - Fastify adapter dynamic factory import, `inject()` request execution, status/headers/body capture
   - End-to-end `ExecutionEngine` workflow on fixture repositories
   - Negative tests: invalid repositories, missing exports, probe timeouts, uncaught startup errors

3. **End-to-End Tests (`tests/e2e/`)**:
   - Real CLI executable runs (`init`, `diff`, `behavior`, `explain`, `report`, `ci`) against the Fastify regression demonstration repository.

4. **Regression Tests (`tests/regression/`)**:
   - Verifies all 6 canonical behavioral scenarios:
     1. Unchanged endpoint (`/health`) -> 0 deltas
     2. Removed field (`/users/:id`) -> Breaking delta
     3. Altered value (`/config`) -> Changed delta
     4. Status change (`/orders`) -> Risky delta
     5. Header change (`/content`) -> Changed delta
     6. Endpoint failure (`/billing/summary`) -> Breaking delta

5. **Security Tests (`tests/security/`)**:
   - Header redaction for credentials and auth tokens
   - Shell argument safety preventing injection in Git revision inputs

## Running the Test Suite

```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm test:unit

# Run integration tests only
pnpm test:integration

# Run e2e tests only
pnpm test:e2e
```

## Benchmark Methodology & Metrics

Performance measurements conducted using the included Fastify regression demonstration:

- **Git worktree creation & preparation**: ~80 ms
- **Application initialization**: ~15 ms
- **Probe execution (6 HTTP probes)**: ~50 ms
- **Comparison & classification**: ~5 ms
- **Evidence serialization & reporting**: ~10 ms
- **Total end-to-end execution time**: ~1.2 seconds
