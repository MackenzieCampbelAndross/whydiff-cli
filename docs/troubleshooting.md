# WHYDIFF Troubleshooting Guide

## 1. "Cannot resolve revision to a valid commit SHA"

**Symptom**:
`GitError: Cannot resolve revision 'main' to a valid commit SHA`

**Resolution**:
- Ensure the revision or branch name exists in your repository (`git branch -a` or `git tag`).
- If working with remote branches in CI, fetch remote tracking branches first:
  ```bash
  git fetch origin main:main
  ```

---

## 2. "Export 'buildApp' not found in src/app.ts"

**Symptom**:
`Error: Export 'buildApp' not found in src/app.ts. Available exports: [default]`

**Resolution**:
- In your `.whydiff.toml`, configure the export name matching your application factory:
  ```toml
  [application]
  entrypoint = "src/app.ts"
  export = "default"  # or your named export function
  ```
- Fastify applications must export an asynchronous factory function:
  ```typescript
  export async function buildApp() {
    const app = Fastify();
    // register routes...
    return app;
  }
  ```

---

## 3. "Three-dot revision range '...' is not supported"

**Symptom**:
`GitError: Three-dot revision range '...' is not supported in Phase 0.`

**Resolution**:
- Use two-dot syntax: `whydiff diff base..candidate` (e.g. `main..HEAD`).

---

## 4. "Target directory is not inside a Git repository"

**Symptom**:
`Error: Target directory is not inside a Git repository. Please initialize git first.`

**Resolution**:
- WHYDIFF requires Git for revision isolation. Initialize a Git repository with `git init`.

---

## 5. Security Notice: Local Code Execution

WHYDIFF isolates code in separate Git worktrees, but executes the target revisions locally using Node.js to probe runtime endpoints. Only execute WHYDIFF against trusted codebases.
