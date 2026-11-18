import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setupDemoRepository } from "../../examples/fastify-regression-demo/scripts/setup-fixture.js";

const execFileAsync = promisify(execFile);

describe("E2E: Phase 1 CLI Commands & OpenAPI Differential Workflows", () => {
  let demoRepoDir: string;
  const currentDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const cliBin = path.resolve(currentDir, "../../packages/cli/dist/bin/whydiff.js");
  const demoRoot = path.resolve(currentDir, "../../examples/fastify-regression-demo");
  const baselineSpec = path.join(demoRoot, "openapi-baseline.json");
  const candidateSpec = path.join(demoRoot, "openapi-candidate.yaml");

  beforeAll(async () => {
    const fixtureDir = path.resolve(demoRoot, "fixtures/demo-repo-phase1-e2e");
    const fixture = await setupDemoRepository(fixtureDir);
    demoRepoDir = fixture.repoDir;
  });

  it("executes 'whydiff contract inspect' and outputs human-readable summary", async () => {
    const { stdout } = await execFileAsync("node", [cliBin, "contract", "inspect", baselineSpec], {
      windowsHide: true
    });

    expect(stdout).toContain("OPENAPI CONTRACT INSPECTION");
    expect(stdout).toContain("Fastify Regression Demo API");
    expect(stdout).toContain("3.0.3");
    expect(stdout).toContain("/users/{id}");
  });

  it("executes 'whydiff contract inspect --json' and outputs valid JSON", async () => {
    const { stdout } = await execFileAsync("node", [cliBin, "contract", "inspect", baselineSpec, "--json"], {
      windowsHide: true
    });

    const parsed = JSON.parse(stdout);
    expect(parsed.title).toBe("Fastify Regression Demo API");
    expect(parsed.openapiVersion).toBe("3.0.3");
    expect(parsed.endpointCount).toBeGreaterThanOrEqual(5);
  });

  it("executes 'whydiff contract diff' and detects breaking contract changes with exit code 1", async () => {
    let stdout = "";
    let exitCode = 0;

    try {
      const res = await execFileAsync("node", [cliBin, "contract", "diff", baselineSpec, candidateSpec], {
        windowsHide: true
      });
      stdout = res.stdout;
    } catch (err: any) {
      exitCode = err.code ?? 1;
      stdout = err.stdout || "";
    }

    expect(exitCode).toBe(1);
    expect(stdout).toContain("OPENAPI CONTRACT COMPARISON");
    expect(stdout).toContain("Breaking:");
    expect(stdout).toContain("[BREAKING]");
    expect(stdout).toContain("/legacy-endpoint");
  });

  it("executes 'whydiff contract diff --json' and produces structured delta objects", async () => {
    let stdout = "";
    try {
      const res = await execFileAsync("node", [cliBin, "contract", "diff", baselineSpec, candidateSpec, "--json"], {
        windowsHide: true
      });
      stdout = res.stdout;
    } catch (err: any) {
      stdout = err.stdout || "";
    }

    const parsed = JSON.parse(stdout);
    expect(parsed.breakingCount).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(parsed.deltas)).toBe(true);
  });

  it("executes 'whydiff probe generate' and creates schema-derived probes", async () => {
    const { stdout } = await execFileAsync("node", [cliBin, "probe", "generate", baselineSpec], {
      windowsHide: true
    });

    expect(stdout).toContain("SCHEMA-AWARE PROBE GENERATION");
    expect(stdout).toContain("Total Probes:");
    expect(stdout).toContain("gen_get_health");
  });

  it("executes 'whydiff probe generate -o <file>' writing JSON probes to disk", async () => {
    const tempOut = path.join(demoRepoDir, "generated-probes.json");

    const { stdout } = await execFileAsync("node", [cliBin, "probe", "generate", baselineSpec, "-o", tempOut], {
      windowsHide: true
    });

    expect(stdout).toContain("Generated");
    const stat = await fs.stat(tempOut);
    expect(stat.isFile()).toBe(true);

    const content = JSON.parse(await fs.readFile(tempOut, "utf-8"));
    expect(Array.isArray(content)).toBe(true);
    expect(content.length).toBeGreaterThan(0);
  });

  it("executes 'whydiff probe list' from project configuration", async () => {
    const { stdout } = await execFileAsync("node", [cliBin, "probe", "list", "-c", demoRepoDir], {
      windowsHide: true
    });

    expect(stdout).toContain("CONFIGURED PROBES");
    expect(stdout).toContain("probe-1-health");
    expect(stdout).toContain("probe-2-users");
  });

  it("executes 'whydiff auth validate' reporting profile status", async () => {
    const { stdout } = await execFileAsync("node", [cliBin, "auth", "validate", "-c", demoRepoDir], {
      windowsHide: true
    });

    // In demo repo, no auth profiles by default
    expect(stdout).toContain("No authentication profiles configured");
  });

  it("executes 'whydiff diff' with OpenAPI baseline and candidate options", async () => {
    let stdout = "";
    let exitCode = 0;

    try {
      const res = await execFileAsync("node", [
        cliBin,
        "diff",
        "baseline..candidate",
        "-c",
        path.join(demoRepoDir, ".whydiff.toml"),
        "--openapi-baseline",
        baselineSpec,
        "--openapi-candidate",
        candidateSpec
      ], {
        windowsHide: true
      });
      stdout = res.stdout;
    } catch (err: any) {
      exitCode = err.code ?? 1;
      stdout = err.stdout || "";
    }

    expect(exitCode).toBe(1);
    expect(stdout).toContain("OPENAPI CONTRACT DIFFERENCE");
    expect(stdout).toContain("Breaking Changes");
    expect(stdout).toContain("BEHAVIORAL DELTAS");
  });
});
