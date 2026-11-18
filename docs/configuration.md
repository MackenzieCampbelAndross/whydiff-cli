# WHYDIFF Configuration Guide

WHYDIFF uses TOML format for configuration. By default, the CLI looks for `.whydiff.toml` or `whydiff.toml` in the repository root or parent directories.

## Configuration Schema

```toml
version = 1

[project]
name = "my-service"
framework = "fastify"

[application]
entrypoint = "src/app.ts"
export = "buildApp"

[comparison]
timeout_ms = 10000
include_headers = ["content-type", "cache-control"]
ignore_headers = [
  "date",
  "x-request-id",
  "etag",
  "last-modified",
  "transfer-encoding",
  "connection",
  "keep-alive"
]

[execution]
install_dependencies = true
cleanup_worktrees = true

[probes]
file = ".whydiff/probes.json"

[report]
directory = ".whydiff/reports"
format = "terminal"

[ci]
fail_on = "breaking"
```

## Section Details

### `version`
- **Type**: `integer`
- **Required**: Yes
- **Value**: Must be `1` in Phase 0.

### `[project]`
- `name` (string, required): Project identifier used in reports.
- `framework` (string, required): Web application framework. Must be `"fastify"` in Phase 0.

### `[application]`
- `entrypoint` (string, required): Relative path to application file (e.g. `"src/app.ts"` or `"dist/server.js"`).
- `export` (string, default: `"buildApp"`): Name of the exported function or Fastify instance. Supports both named exports and default export.

### `[comparison]`
- `timeout_ms` (integer, default: `10000`): Probe execution timeout in milliseconds.
- `include_headers` (array of strings, default: `[]`): If specified, only these header keys are compared.
- `ignore_headers` (array of strings): Headers ignored during comparison. Defaults to volatile transport headers (`date`, `x-request-id`, `etag`, etc.).

### `[execution]`
- `install_dependencies` (boolean, default: `true`): Whether to prepare dependencies in isolated worktrees.
- `cleanup_worktrees` (boolean, default: `true`): Whether to remove worktrees upon completion.

### `[probes]`
- `file` (string, default: `".whydiff/probes.json"`): Path to the JSON or TOML probes definition file.

### `[report]`
- `directory` (string, default: `".whydiff/reports"`): Directory where structured JSON evidence reports are saved.
- `format` (string, default: `"terminal"`): Default report output format (`"terminal"` or `"json"`).

### `[ci]`
- `fail_on` (string, default: `"breaking"`): CI failure policy:
  - `"breaking"`: Exit code 1 if any breaking changes are detected.
  - `"risky"`: Exit code 1 if breaking or risky changes are detected.
  - `"changed"`: Exit code 1 if any differences are detected.
  - `"never"`: Always exit code 0 unless an execution failure occurs.
