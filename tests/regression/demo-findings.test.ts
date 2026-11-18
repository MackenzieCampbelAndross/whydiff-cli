import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { setupDemoRepository } from "../../examples/fastify-regression-demo/scripts/setup-fixture.js";
import { ExecutionEngine, loadConfig } from "@whydiff/core";

describe("Regression: 6 Demonstration Scenarios Verification", () => {
  let demoRepoDir: string;
  let report: any;

  beforeAll(async () => {
    const fixtureDir = path.resolve(__dirname, "../../examples/fastify-regression-demo/fixtures/demo-repo-regression");
    const fixture = await setupDemoRepository(fixtureDir);
    demoRepoDir = fixture.repoDir;
    const configPath = path.join(demoRepoDir, ".whydiff.toml");
    const loaded = await loadConfig(configPath);
    const engine = new ExecutionEngine();
    report = await engine.execute({
      config: loaded.config,
      rootDir: demoRepoDir,
      revisionRange: "baseline..candidate"
    });
  });

  it("Scenario 1: Verifies unchanged endpoint (/health) produces NO delta", () => {
    const healthDelta = report.deltas.find((d: any) => d.before.request.path === "/health");
    expect(healthDelta).toBeUndefined();
  });

  it("Scenario 2: Verifies removed response field (/users/123) is detected as BREAKING", () => {
    const delta = report.deltas.find((d: any) => d.before.request.path === "/users/123");
    expect(delta).toBeDefined();
    expect(delta.severity).toBe("breaking");
    const diff = delta.differences.find((df: any) => df.path === "body.email");
    expect(diff).toBeDefined();
    expect(diff.kind).toBe("removed");
    expect(diff.beforeValue).toBe("alice@example.com");
  });

  it("Scenario 3: Verifies altered response value (/config) is detected as CHANGED", () => {
    const delta = report.deltas.find((d: any) => d.before.request.path === "/config");
    expect(delta).toBeDefined();
    expect(delta.severity).toBe("changed");
    const diff = delta.differences.find((df: any) => df.path === "body.mode");
    expect(diff).toBeDefined();
    expect(diff.kind).toBe("changed");
    expect(diff.beforeValue).toBe("standard");
    expect(diff.afterValue).toBe("legacy");
  });

  it("Scenario 4: Verifies HTTP status code change (/orders) is detected as RISKY", () => {
    const delta = report.deltas.find((d: any) => d.before.request.path === "/orders");
    expect(delta).toBeDefined();
    expect(delta.severity).toBe("risky");
    const diff = delta.differences.find((df: any) => df.path === "statusCode");
    expect(diff).toBeDefined();
    expect(diff.kind).toBe("status_changed");
    expect(diff.beforeValue).toBe(201);
    expect(diff.afterValue).toBe(200);
  });

  it("Scenario 5: Verifies changed response header (/content) is detected as CHANGED", () => {
    const delta = report.deltas.find((d: any) => d.before.request.path === "/content");
    expect(delta).toBeDefined();
    expect(delta.severity).toBe("changed");
    const diff = delta.differences.find((df: any) => df.path === "headers.cache-control");
    expect(diff).toBeDefined();
    expect(diff.kind).toBe("header_changed");
    expect(diff.beforeValue).toBe("public, max-age=3600");
    expect(diff.afterValue).toBe("no-store");
  });

  it("Scenario 6: Verifies endpoint failure (/billing/summary) is detected as BREAKING", () => {
    const delta = report.deltas.find((d: any) => d.before.request.path === "/billing/summary");
    expect(delta).toBeDefined();
    expect(delta.severity).toBe("breaking");
    const statusDiff = delta.differences.find((df: any) => df.path === "statusCode");
    expect(statusDiff).toBeDefined();
    expect(statusDiff.beforeValue).toBe(200);
    expect(statusDiff.afterValue).toBe(500);
  });
});
