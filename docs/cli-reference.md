# WHYDIFF CLI Reference

The `whydiff` command line tool provides behavioral comparison and regression analysis between Git revisions.

## Global Options

- `-V, --version`: Print the version of WHYDIFF.
- `-h, --help`: Print command help.

---

## 1. `whydiff init [dir]`

Initializes a WHYDIFF configuration in the current or target directory.

```bash
whydiff init
whydiff init ./my-project --name my-api --entrypoint src/server.ts --overwrite
```

### Options:
- `--overwrite`: Overwrites existing configuration if already present.
- `--name <name>`: Custom project name.
- `--entrypoint <path>`: Custom application entrypoint.

---

## 2. `whydiff diff <revisions>`

The primary comparison command. Executes configured HTTP probes across both Git revisions and outputs a formatted behavioral delta summary.

```bash
whydiff diff main..HEAD
whydiff diff v1.0.0..v1.1.0
whydiff diff abc1234..def5678 -v
```

### Options:
- `-c, --config <path>`: Explicit path to `.whydiff.toml`.
- `-v, --verbose`: Display detailed evidence lines for each delta.

### Exit Codes:
- `0`: No breaking differences detected.
- `1`: Breaking differences detected.
- `2`: Analysis, Git, or infrastructure failure.

---

## 3. `whydiff behavior <revisions>`

Executes probes and outputs an in-depth technical comparison including individual probe latencies, response codes, and bodies for both revisions.

```bash
whydiff behavior main..HEAD
```

---

## 4. `whydiff explain <delta-id>`

Explains a specific detected behavioral delta in detail, including observed baseline and candidate response payloads, exact field diffs, evidence references, and limitations.

```bash
whydiff explain bd_001
whydiff explain bd_001 --run run_1710000000000_abc123
```

### Options:
- `-r, --run <run-id>`: Specific run ID (defaults to latest run).
- `-c, --config <path>`: Explicit path to `.whydiff.toml`.

---

## 5. `whydiff report`

Views or exports the latest (or specified) analysis run report.

```bash
whydiff report --format=terminal
whydiff report --format=json > report.json
```

### Options:
- `-f, --format <format>`: Report format: `terminal` or `json`.
- `-r, --run <run-id>`: Specific run ID (defaults to latest run).

---

## 6. `whydiff ci`

Executes behavioral comparison with CI policy exit codes.

```bash
whydiff ci --base=origin/main --candidate=HEAD --fail-on=breaking
```

### Options:
- `-b, --base <ref>`: Baseline Git revision (default: `main`).
- `-k, --candidate <ref>`: Candidate Git revision (default: `HEAD`).
- `--fail-on <policy>`: Policy threshold: `breaking`, `risky`, `changed`, `never`.
