import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createWorktree, removeWorktree } from "../git/cli.js";

const execFileAsync = promisify(execFile);

export interface WorktreeRevision {
  revisionRef: string;
  commitSha: string;
  worktreePath: string;
}

export interface IsolatedRevisions {
  runId: string;
  baseline: WorktreeRevision;
  candidate: WorktreeRevision;
  cleanup: () => Promise<void>;
}

export class RevisionManager {
  constructor(
    private readonly repoRoot: string,
    private readonly worktreesBaseDir: string,
    private readonly options: { installDependencies?: boolean; cleanup?: boolean } = {}
  ) {}

  public async isolateRevisions(
    runId: string,
    base: { ref: string; sha: string },
    candidate: { ref: string; sha: string }
  ): Promise<IsolatedRevisions> {
    const runDir = path.resolve(this.worktreesBaseDir, runId);
    const baselinePath = path.join(runDir, "baseline");
    const candidatePath = path.join(runDir, "candidate");

    await fs.mkdir(runDir, { recursive: true });

    // 1. Create baseline worktree
    await createWorktree(this.repoRoot, base.sha, baselinePath);

    // 2. Create candidate worktree
    try {
      await createWorktree(this.repoRoot, candidate.sha, candidatePath);
    } catch (err) {
      // If candidate fails, clean up baseline
      await removeWorktree(this.repoRoot, baselinePath).catch(() => {});
      throw err;
    }

    // 3. Prepare dependencies in worktrees if needed
    if (this.options.installDependencies) {
      await this.prepareDependencies(baselinePath);
      await this.prepareDependencies(candidatePath);
    }

    const cleanup = async () => {
      if (this.options.cleanup !== false) {
        await removeWorktree(this.repoRoot, baselinePath).catch(() => {});
        await removeWorktree(this.repoRoot, candidatePath).catch(() => {});
        try {
          await fs.rm(runDir, { recursive: true, force: true });
        } catch {
          // Ignore directory rm failure
        }
      }
    };

    return {
      runId,
      baseline: {
        revisionRef: base.ref,
        commitSha: base.sha,
        worktreePath: baselinePath
      },
      candidate: {
        revisionRef: candidate.ref,
        commitSha: candidate.sha,
        worktreePath: candidatePath
      },
      cleanup
    };
  }

  private async prepareDependencies(worktreePath: string): Promise<void> {
    const wtPkgJson = path.join(worktreePath, "package.json");
    try {
      await fs.stat(wtPkgJson);
    } catch {
      // No package.json, skip
      return;
    }

    const wtNodeModules = path.join(worktreePath, "node_modules");
    try {
      const stat = await fs.stat(wtNodeModules);
      if (stat.isDirectory()) return;
    } catch {
      // node_modules doesn't exist yet
    }

    // Check if root repo has node_modules we can reuse
    const rootNodeModules = path.join(this.repoRoot, "node_modules");
    let hasRootNodeModules = false;
    try {
      const stat = await fs.stat(rootNodeModules);
      hasRootNodeModules = stat.isDirectory();
    } catch {
      hasRootNodeModules = false;
    }

    if (hasRootNodeModules) {
      try {
        // Create directory junction on Windows or symlink on unix
        const symlinkType = process.platform === "win32" ? "junction" : "dir";
        await fs.symlink(rootNodeModules, wtNodeModules, symlinkType);
        return;
      } catch {
        // If symlink fails, fall back to installing dependencies
      }
    }

    // Run package manager install as fallback
    try {
      await execFileAsync("pnpm", ["install", "--ignore-scripts"], {
        cwd: worktreePath,
        timeout: 60000,
        windowsHide: true
      });
    } catch {
      try {
        await execFileAsync("npm", ["install", "--ignore-scripts"], {
          cwd: worktreePath,
          timeout: 60000,
          windowsHide: true
        });
      } catch {
        // Non-fatal if install fails (app may not need additional dependencies)
      }
    }
  }
}
