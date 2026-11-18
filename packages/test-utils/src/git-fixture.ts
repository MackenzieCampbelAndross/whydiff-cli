import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitFixtureCommit {
  message: string;
  files: Record<string, string>;
  tag?: string;
  branch?: string;
}

export class GitFixture {
  constructor(public readonly dir: string) {}

  public static async create(baseDir: string, name = "test-repo"): Promise<GitFixture> {
    const repoDir = path.resolve(baseDir, `${name}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
    await fs.mkdir(repoDir, { recursive: true });

    const fixture = new GitFixture(repoDir);
    await fixture.git(["init", "-b", "main"]);
    await fixture.git(["config", "user.name", "MackenzieCampbelAndross"]);
    await fixture.git(["config", "user.email", "mackenzieandross@gmail.com"]);
    return fixture;
  }

  public async git(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync("git", args, {
      cwd: this.dir,
      windowsHide: true
    });
    return stdout.trim();
  }

  public async commitFiles(message: string, files: Record<string, string>): Promise<string> {
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(this.dir, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, "utf-8");
    }

    await this.git(["add", "."]);
    await this.git(["commit", "-m", message]);
    return await this.git(["rev-parse", "HEAD"]);
  }

  public async createBranch(branchName: string): Promise<void> {
    await this.git(["checkout", "-b", branchName]);
  }

  public async checkout(ref: string): Promise<void> {
    await this.git(["checkout", ref]);
  }

  public async cleanup(): Promise<void> {
    try {
      await fs.rm(this.dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error on Windows if locked briefly
    }
  }
}
