import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import { GitCommitInfo, WorktreeInfo } from "./types.js";

const execFileAsync = promisify(execFile);

export class GitError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly exitCode?: number,
    public readonly stderr?: string
  ) {
    super(message);
    this.name = "GitError";
  }
}

export async function runGit(
  args: string[],
  cwd: string,
  timeoutMs = 30000
): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true
    });
    return {
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim()
    };
  } catch (err: unknown) {
    const error = err as {
      message: string;
      code?: number;
      stderr?: string;
      stdout?: string;
    };
    const stderrText = error.stderr ? error.stderr.trim() : "";
    throw new GitError(
      `Git command failed: git ${args.join(" ")}\n${stderrText || error.message}`,
      `git ${args.join(" ")}`,
      error.code,
      stderrText
    );
  }
}

export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const { stdout } = await runGit(["rev-parse", "--is-inside-work-tree"], dir);
    return stdout === "true";
  } catch {
    return false;
  }
}

export async function getGitRoot(dir: string): Promise<string> {
  const { stdout } = await runGit(["rev-parse", "--show-toplevel"], dir);
  return path.resolve(stdout);
}

const INVALID_REF_CHARS = /[\s;`$|&><\\*?~^:[\]{}()]/;

export function parseRevisionRange(range: string): { baseRef: string; candidateRef: string } {
  const trimmed = range.trim();
  if (trimmed.includes("...")) {
    throw new GitError(
      `Three-dot revision range '...' is not supported in Phase 0. Please use '<base>..<candidate>'`,
      range
    );
  }
  if (trimmed.includes("..")) {
    const parts = trimmed.split("..");
    if (parts.length === 2 && parts[0] && parts[1] && !parts[0].endsWith(".") && !parts[1].startsWith(".")) {
      const base = parts[0].trim();
      const candidate = parts[1].trim();
      // Validate that ref names do not contain shell injection characters
      const SHELL_CHARS = /[;`$|&><\\]/;
      if (SHELL_CHARS.test(base) || SHELL_CHARS.test(candidate)) {
        throw new GitError(`Revision contains invalid characters: '${range}'`, range);
      }
      return {
        baseRef: base,
        candidateRef: candidate
      };
    }
  }
  throw new GitError(
    `Invalid revision range format: '${range}'. Expected format: '<base>..<candidate>' (e.g. 'main..HEAD' or 'v1..v2')`,
    range
  );
}

export async function resolveRevision(ref: string, cwd: string): Promise<string> {
  try {
    const { stdout } = await runGit(["rev-parse", "--verify", `${ref}^{commit}`], cwd);
    return stdout.trim();
  } catch {
    throw new GitError(
      `Cannot resolve revision '${ref}' to a valid commit SHA in repository at ${cwd}`,
      `git rev-parse --verify ${ref}^{commit}`
    );
  }
}

export async function getCommitInfo(sha: string, cwd: string): Promise<GitCommitInfo> {
  // Format: hash%x1fshort_hash%x1faname%x1faemail%x1fdate%x1fs_subject
  const format = "%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s";
  const { stdout } = await runGit(["show", "-s", `--format=${format}`, sha], cwd);
  const parts = stdout.split("\x1f");

  return {
    sha: parts[0] ?? sha,
    shortSha: parts[1] ?? sha.slice(0, 7),
    author: parts[2] ?? "",
    email: parts[3] ?? "",
    date: parts[4] ?? "",
    subject: parts[5] ?? ""
  };
}

export async function listWorktrees(cwd: string): Promise<WorktreeInfo[]> {
  try {
    const { stdout } = await runGit(["worktree", "list", "--porcelain"], cwd);
    const worktrees: WorktreeInfo[] = [];
    const entries = stdout.split("\n\n");

    for (const entry of entries) {
      if (!entry.trim()) continue;
      const lines = entry.split("\n");
      let wtPath = "";
      let wtSha = "";
      let wtBranch: string | undefined;
      let bare = false;

      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          wtPath = line.substring(9).trim();
        } else if (line.startsWith("HEAD ")) {
          wtSha = line.substring(5).trim();
        } else if (line.startsWith("branch ")) {
          wtBranch = line.substring(7).trim();
        } else if (line === "bare") {
          bare = true;
        }
      }

      if (wtPath) {
        worktrees.push({
          path: path.resolve(wtPath),
          commitSha: wtSha,
          branch: wtBranch,
          bare
        });
      }
    }
    return worktrees;
  } catch (err) {
    throw new GitError(`Failed to list worktrees: ${(err as Error).message}`, "git worktree list");
  }
}

export async function createWorktree(cwd: string, commitSha: string, targetPath: string): Promise<void> {
  const resolvedTarget = path.resolve(targetPath);
  await fs.mkdir(path.dirname(resolvedTarget), { recursive: true });

  await runGit(["worktree", "add", "--detach", resolvedTarget, commitSha], cwd);
}

export async function removeWorktree(cwd: string, targetPath: string): Promise<void> {
  const resolvedTarget = path.resolve(targetPath);
  try {
    await runGit(["worktree", "remove", "--force", resolvedTarget], cwd);
  } catch (err) {
    // If worktree remove fails, attempt to delete directory and prune
    try {
      await fs.rm(resolvedTarget, { recursive: true, force: true });
    } catch {
      // Ignore directory removal error
    }
  }

  try {
    await runGit(["worktree", "prune"], cwd);
  } catch {
    // Ignore prune error
  }
}
