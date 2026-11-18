import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function setupDemoRepository(targetDir?: string): Promise<{ repoDir: string; baselineRef: string; candidateRef: string }> {
  const currentDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const demoRoot = path.resolve(currentDir, "..");
  const repoDir = targetDir
    ? path.resolve(targetDir)
    : path.resolve(demoRoot, "fixtures", "demo-repo");

  // Clean existing fixture repo if any
  try {
    await fs.rm(repoDir, { recursive: true, force: true });
  } catch {
    // Ignore
  }

  await fs.mkdir(repoDir, { recursive: true });

  const runGit = async (args: string[]) => {
    return (await execFileAsync("git", args, { cwd: repoDir, windowsHide: true })).stdout.trim();
  };

  // 1. Initialize Git repository
  await runGit(["init", "-b", "main"]);
  await runGit(["config", "user.name", "MackenzieCampbelAndross"]);
  await runGit(["config", "user.email", "mackenzieandross@gmail.com"]);

  // Write .gitignore so node_modules is ignored by git
  await fs.writeFile(path.join(repoDir, ".gitignore"), "node_modules/\n.whydiff/worktrees/\n.whydiff/reports/\n", "utf-8");

  // 2. Prepare baseline files
  await fs.mkdir(path.join(repoDir, "src"), { recursive: true });
  await fs.mkdir(path.join(repoDir, ".whydiff"), { recursive: true });

  const baselineSource = await fs.readFile(path.join(demoRoot, "src", "app-baseline.ts"), "utf-8");
  const candidateSource = await fs.readFile(path.join(demoRoot, "src", "app-candidate.ts"), "utf-8");
  const probesConfig = await fs.readFile(path.join(demoRoot, ".whydiff", "probes.json"), "utf-8");
  const tomlConfig = await fs.readFile(path.join(demoRoot, ".whydiff.toml"), "utf-8");
  const pkgJson = await fs.readFile(path.join(demoRoot, "package.json"), "utf-8");

  await fs.writeFile(path.join(repoDir, "src", "app.ts"), baselineSource, "utf-8");
  await fs.writeFile(path.join(repoDir, ".whydiff", "probes.json"), probesConfig, "utf-8");
  await fs.writeFile(path.join(repoDir, ".whydiff.toml"), tomlConfig, "utf-8");
  await fs.writeFile(path.join(repoDir, "package.json"), pkgJson, "utf-8");

  // Link node_modules so worktree runners resolve fastify
  const nodeModulesSrc = path.resolve(demoRoot, "../../node_modules");
  const nodeModulesDest = path.join(repoDir, "node_modules");
  try {
    const symlinkType = process.platform === "win32" ? "junction" : "dir";
    await fs.symlink(nodeModulesSrc, nodeModulesDest, symlinkType);
  } catch {
    // Non-fatal if symlink already exists or fails
  }

  // Commit baseline
  await runGit(["add", "."]);
  await runGit(["commit", "-m", "Baseline release v1.0.0"]);
  await runGit(["tag", "baseline"]);

  // 3. Prepare candidate files
  await fs.writeFile(path.join(repoDir, "src", "app.ts"), candidateSource, "utf-8");

  // Commit candidate
  await runGit(["add", "."]);
  await runGit(["commit", "-m", "Candidate release with behavioral regressions v1.1.0"]);
  await runGit(["tag", "candidate"]);

  return {
    repoDir,
    baselineRef: "baseline",
    candidateRef: "candidate"
  };
}

// Direct execution support
if (process.argv[1] && process.argv[1].includes("setup-fixture")) {
  setupDemoRepository().then(res => {
    console.log("Demo repository ready at:", res.repoDir);
    console.log("Run diff command:");
    console.log("  whydiff diff baseline..candidate --config " + path.join(res.repoDir, ".whydiff.toml"));
  }).catch(err => {
    console.error("Setup failed:", err);
    process.exit(1);
  });
}
