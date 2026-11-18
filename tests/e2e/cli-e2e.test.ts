import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setupDemoRepository } from "../../examples/fastify-regression-demo/scripts/setup-fixture.js";

const execFileAsync = promisify(execFile);

describe("E2E: Complete CLI Workflow against Demonstration Repository", () => {
  let demoRepoDir: string;
  const cliBin = path.resolve(__dirname, "../../packages/cli/dist/bin/whydiff.js");

  beforeAll(async () => {
    const fixtureDir = path.resolve(__dirname, "../../examples/fastify-regression-demo/fixtures/demo-repo-e2e");
    const fixture = await setupDemoRepository(fixtureDir);
    demoRepoDir = fixture.repoDir;
  });

  it("verifies 'whydiff init' creates .whydiff.toml and probes.json in empty git repo", async () => {
    const tempInitDir = await fs.mkdtemp(path.join(os.tmpdir(), "whydiff-e2e-init-"));
    await execFileAsync("git", ["init", "-b", "main"], { cwd: tempInitDir });

    const { stdout } = await execFileAsync("node", [cliBin, "init", tempInitDir], {
      windowsHide: true
    });

    expect(stdout).toContain("Initialized WHYDIFF configuration successfully");

    const tomlStat = await fs.stat(path.join(tempInitDir, ".whydiff.toml"));
    const probesStat = await fs.stat(path.join(tempInitDir, ".whydiff", "probes.json"));
    expect(tomlStat.isFile()).toBe(true);
    expect(probesStat.isFile()).toBe(true);

    await fs.rm(tempInitDir, { recursive: true, force: true });
  });

  it("executes 'whydiff diff baseline..candidate' and detects the 5 behavioral regressions", async () => {
    const configPath = path.join(demoRepoDir, ".whydiff.toml");

    let stdout = "";
    let exitCode = 0;

    try {
      const res = await execFileAsync("node", [cliBin, "diff", "baseline..candidate", "--config", configPath], {
        cwd: demoRepoDir,
        windowsHide: true
      });
      stdout = res.stdout;
    } catch (err: unknown) {
      const error = err as { stdout: string; code: number };
      stdout = error.stdout;
      exitCode = error.code;
    }

    // Must exit with code 1 due to breaking changes
    expect(exitCode).toBe(1);
    expect(stdout).toContain("WHYDIFF v0.1.0");
    expect(stdout).toContain("BASELINE       baseline");
    expect(stdout).toContain("CANDIDATE      candidate");
    expect(stdout).toContain("Executed             6");
    expect(stdout).toContain("Successful           6");
    expect(stdout).toContain("Breaking               2");
    expect(stdout).toContain("Risky                  1");
    expect(stdout).toContain("Changed                2");
    expect(stdout).toContain("5 behavioral delta(s) detected.");
  });

  it("executes 'whydiff behavior baseline..candidate' with detailed probe comparison", async () => {
    const configPath = path.join(demoRepoDir, ".whydiff.toml");

    let stdout = "";
    try {
      const res = await execFileAsync("node", [cliBin, "behavior", "baseline..candidate", "--config", configPath], {
        cwd: demoRepoDir,
        windowsHide: true
      });
      stdout = res.stdout;
    } catch (err: unknown) {
      stdout = (err as { stdout: string }).stdout;
    }

    expect(stdout).toContain("DETAILED TECHNICAL PROBE COMPARISON");
    expect(stdout).toContain("Probe [probe-1-health]: GET /health");
    expect(stdout).toContain("Probe [probe-2-users]: GET /users/123");
    expect(stdout).toContain("Probe [probe-6-billing]: GET /billing/summary");
  });

  it("executes 'whydiff explain bd_001' with ground truth evidence", async () => {
    const configPath = path.join(demoRepoDir, ".whydiff.toml");

    const { stdout } = await execFileAsync("node", [cliBin, "explain", "bd_001", "--config", configPath], {
      cwd: demoRepoDir,
      windowsHide: true
    });

    expect(stdout).toContain("EXPLANATION FOR DELTA: bd_001");
    expect(stdout).toContain("Severity:     BREAKING");
    expect(stdout).toContain("Confidence:   100%");
    expect(stdout).toContain("GET /users/123");
    expect(stdout).toContain("Observed Impact:");
    expect(stdout).toContain("Limitations:");
  });

  it("executes 'whydiff report --format json' and produces valid JSON report", async () => {
    const configPath = path.join(demoRepoDir, ".whydiff.toml");

    const { stdout } = await execFileAsync("node", [cliBin, "report", "--format", "json", "--config", configPath], {
      cwd: demoRepoDir,
      windowsHide: true
    });

    const parsed = JSON.parse(stdout);
    expect(parsed.metadata.project.name).toBe("fastify-regression-demo");
    expect(parsed.metadata.statistics.deltaCount).toBe(5);
    expect(parsed.deltas).toHaveLength(5);
    expect(parsed.baselineObservations).toHaveLength(6);
    expect(parsed.candidateObservations).toHaveLength(6);
  });

  it("executes 'whydiff ci' with exit 0 on --fail-on never", async () => {
    const configPath = path.join(demoRepoDir, ".whydiff.toml");

    const { stdout } = await execFileAsync(
      "node",
      [cliBin, "ci", "--base", "baseline", "--candidate", "candidate", "--fail-on", "never", "--config", configPath],
      { cwd: demoRepoDir, windowsHide: true }
    );

    expect(stdout).toContain("ANALYSIS COMPLETE");
  });
});
