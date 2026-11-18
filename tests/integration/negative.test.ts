import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { ExecutionEngine, getDefaultConfig, FastifyAdapter } from "@whydiff/core";

describe("Integration: Negative and Failure Scenarios", () => {
  const tmpBase = path.resolve(__dirname, "../.tmp");

  it("fails gracefully when executed outside a Git repository", async () => {
    const nonGitDir = await fs.mkdtemp(path.join(os.tmpdir(), "whydiff-nongit-"));
    const config = getDefaultConfig("non-git", "src/app.ts");
    const engine = new ExecutionEngine();

    await expect(
      engine.execute({
        config,
        rootDir: nonGitDir,
        revisionRange: "main..HEAD"
      })
    ).rejects.toThrowError(/not a Git repository/);

    await fs.rm(nonGitDir, { recursive: true, force: true });
  });

  it("fails gracefully when export is not found in application entrypoint", async () => {
    await fs.mkdir(tmpBase, { recursive: true });
    const tempDir = await fs.mkdtemp(path.join(tmpBase, "noexport-"));
    const appCode = `
export async function differentExport() {
  return null;
}
`;
    await fs.writeFile(path.join(tempDir, "app.mjs"), appCode, "utf-8");

    const adapter = new FastifyAdapter();
    const probes = [
      { id: "test", name: "test", method: "GET" as const, path: "/test" }
    ];

    const observations = await adapter.executeProbes(
      tempDir,
      "app.mjs",
      "buildApp",
      probes,
      5000,
      "main"
    );

    expect(observations).toHaveLength(1);
    expect(observations[0]?.error).toBeDefined();
    expect(observations[0]?.error?.message).toContain("Export 'buildApp' not found");

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("handles request timeouts honestly without crashing", async () => {
    await fs.mkdir(tmpBase, { recursive: true });
    const tempDir = await fs.mkdtemp(path.join(tmpBase, "timeout-"));
    const appCode = `
import Fastify from "fastify";

export async function buildApp() {
  const app = Fastify({ logger: false });
  app.get("/slow", async () => {
    await new Promise(r => setTimeout(r, 2000));
    return { status: "slow" };
  });
  return app;
}
`;
    await fs.writeFile(path.join(tempDir, "app.mjs"), appCode, "utf-8");

    const rootNodeModules = path.resolve(__dirname, "../../node_modules");
    try {
      const symlinkType = process.platform === "win32" ? "junction" : "dir";
      await fs.symlink(rootNodeModules, path.join(tempDir, "node_modules"), symlinkType);
    } catch {
      // Ignore
    }

    const adapter = new FastifyAdapter();
    const probes = [
      { id: "slow-probe", name: "Slow probe", method: "GET" as const, path: "/slow", timeoutMs: 100 }
    ];

    const observations = await adapter.executeProbes(
      tempDir,
      "app.mjs",
      "buildApp",
      probes,
      100, // Short timeout
      "main"
    );

    expect(observations).toHaveLength(1);
    expect(observations[0]?.error?.message).toContain("timed out");

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
