# WHYDIFF Architecture & System Design

## 1. Overview

WHYDIFF is a behavioral change detection and verification engine. While traditional version control compares textual changes between files, WHYDIFF evaluates the behavioral difference between two executable software revisions by probing them under identical inputs and comparing observed system outputs.

## 2. Monorepo & Package Structure

WHYDIFF uses a modular monolithic architecture managed via pnpm workspaces:

```text
packages/
├── core/             # Core comparison, isolation, and analysis engine (@whydiff/core)
│   ├── config/       # TOML configuration parser and Zod validation schema
│   ├── git/          # Safe Git CLI wrapper with revision parsing & SHA resolution
│   ├── revisions/    # Revision isolation manager leveraging Git worktrees
│   ├── adapters/     # Modular application runtime adapters (FastifyAdapter)
│   ├── probes/       # HTTP probe schema, loader, and deterministic ordering
│   ├── execution/    # Orchestration engine executing probes across revisions
│   ├── observations/ # Observation model, JSON canonicalizer, and header normalizer
│   ├── comparison/   # Deep observation diffing engine
│   ├── classification/# Deterministic delta severity classifier
│   ├── evidence/     # Structured JSON report persistence and retrieval
│   └── reporting/    # Terminal and JSON report formatters
│
├── cli/              # Command line interface executable (whydiff)
│   ├── bin/whydiff.ts# Executable entrypoint with Commander.js
│   ├── commands/     # init, diff, behavior, explain, report, ci
│   └── errors/       # CLI error model and exit code mapping
│
└── test-utils/       # Test fixtures, Git repository simulators, and mock apps
```

## 3. Data Flow & Execution Pipeline

```text
[ Developer CLI / CI ]
         │
         ▼
[ whydiff diff <base>..<cand> ]
         │
         ├── 1. Parse & validate .whydiff.toml configuration
         ├── 2. Resolve revision refs to immutable commit SHAs via native Git CLI
         ├── 3. Load & validate HTTP probes from .whydiff/probes.json
         ├── 4. Create isolated Git worktrees for baseline and candidate commits
         ├── 5. Application Adapter (FastifyAdapter):
         │       - Baseline worktree: load factory, ready(), inject probes, close()
         │       - Candidate worktree: load factory, ready(), inject probes, close()
         ├── 6. Safely remove isolated worktrees and prune Git references
         ├── 7. Normalize observations (canonicalize JSON keys, filter/redact headers)
         ├── 8. Deep compare baseline vs candidate observations
         ├── 9. Classify detected differences (breaking, risky, changed, informational)
         ├── 10. Persist structured evidence in .whydiff/reports/<run-id>/
         └── 11. Render formatted terminal/JSON report & emit standard exit code
```

## 4. Key Architectural Guarantees

1. **Active Tree Isolation**: WHYDIFF never modifies or checks out branches in the user's active working tree. All execution happens in temporary Git worktrees.
2. **Deterministic Comparison**: Object keys are sorted recursively, headers are normalized to lowercase, and volatile headers (e.g. `date`, `x-request-id`) are ignored by default.
3. **Execution Over Speculation**: Deltas are never inferred from code syntax or comments; every finding is backed by an actual executed HTTP probe observation.
4. **Security by Default**: Sensitive authentication headers (`authorization`, `cookie`, `x-api-key`) are automatically redacted from stored reports and console output.
