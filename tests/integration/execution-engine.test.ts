import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { GitFixture } from "@whydiff/test-utils";
import { ExecutionEngine, WhydiffConfig, EvidenceStore } from "@whydiff/core";

describe("Integration: Execution Engine Pipeline", () => {
  let fixture: GitFixture | null = null;
  const tmpBase = path.resolve(__dirname, "../.tmp");

  afterEach(async () => {
    if (fixture) {
      await fixture.cleanup();
      fixture = null;
    }
  });

  it("executes comparison between baseline and candidate commits and saves reports", async () => {
    await fs.mkdir(tmpBase, { recursive: true });
    fixture = await GitFixture.create(tmpBase, "engine-test");

    const tomlConfig = `
version = 1
[project]
name = "integration-test-api"
framework = "fastify"
[application]
entrypoint = "src/app.mjs"
export = "buildApp"
[comparison]
timeout_ms = 5000
include_headers = ["content-type"]
[execution]
install_dependencies = false
cleanup_worktrees = true
[probes]
file = ".whydiff/probes.json"
[report]
directory = ".whydiff/reports"
`;

    const probesJson = JSON.stringify({
      probes: [
        { id: "p-health", name: "Health", method: "GET", path: "/health" },
        { id: "p-data", name: "Data", method: "GET", path: "/data" }
      ]
    });

    const baselineApp = `
import Fastify from "fastify";
export async function buildApp() {
  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/data", async () => ({ id: 1, fieldA: "valA", fieldB: "valB" }));
  return app;
}
`;

    const candidateApp = `
import Fastify from "fastify";
export async function buildApp() {
  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/data", async () => ({ id: 1, fieldA: "valA" })); // fieldB removed
  return app;
}
`;

    // Write .gitignore so node_modules is ignored by git
    await fs.writeFile(path.join(fixture.dir, ".gitignore"), "node_modules/\n.whydiff/\n", "utf-8");

    // Link node_modules in fixture dir
    const rootNodeModules = path.resolve(__dirname, "../../node_modules");
    try {
      const symlinkType = process.platform === "win32" ? "junction" : "dir";
      await fs.symlink(rootNodeModules, path.join(fixture.dir, "node_modules"), symlinkType);
    } catch {
      // Ignore
    }

    // 1. Commit baseline
    await fixture.commitFiles("Baseline commit", {
      ".whydiff.toml": tomlConfig,
      ".whydiff/probes.json": probesJson,
      "src/app.mjs": baselineApp
    });
    await fixture.git(["tag", "v1.0.0"]);

    // 2. Commit candidate
    await fixture.commitFiles("Candidate commit with removed fieldB", {
      "src/app.mjs": candidateApp
    });
    await fixture.git(["tag", "v2.0.0"]);

    const config: WhydiffConfig = {
      version: 1,
      project: { name: "integration-test-api", framework: "fastify" },
      application: { entrypoint: "src/app.mjs", export: "buildApp" },
      comparison: {
        timeout_ms: 5000,
        include_headers: ["content-type"],
        ignore_headers: ["date"]
      },
      execution: {
        install_dependencies: false,
        cleanup_worktrees: true
      },
      probes: { file: ".whydiff/probes.json" },
      report: { directory: ".whydiff/reports", format: "terminal" },
      ci: { fail_on: "breaking" }
    };

    const engine = new ExecutionEngine();
    const report = await engine.execute({
      config,
      rootDir: fixture.dir,
      revisionRange: "v1.0.0..v2.0.0"
    });

    expect(report.metadata.statistics.probeCount).toBe(2);
    expect(report.metadata.statistics.deltaCount).toBe(1);
    expect(report.metadata.statistics.breakingCount).toBe(1);

    const delta = report.deltas[0]!;
    expect(delta.id).toBe("bd_001");
    expect(delta.severity).toBe("breaking");
    expect(delta.before.request.path).toBe("/data");
    const removedDiff = delta.differences.find(d => d.kind === "removed");
    expect(removedDiff?.path).toBe("body.fieldB");

    // Check evidence was written to disk
    const reportsDir = path.join(fixture.dir, ".whydiff", "reports");
    const store = new EvidenceStore(reportsDir);
    const loaded = await store.getLatestRun();
    expect(loaded?.metadata.runId).toBe(report.metadata.runId);
  });
});
