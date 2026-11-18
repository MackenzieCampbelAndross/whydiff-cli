import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { FastifyAdapter, HttpProbe } from "@whydiff/core";

describe("Integration: Fastify Adapter", () => {
  let tempDir: string | null = null;
  const tmpBase = path.resolve(__dirname, "../.tmp");

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      tempDir = null;
    }
  });

  it("loads Fastify factory and captures HTTP status, headers and body via inject", async () => {
    await fs.mkdir(tmpBase, { recursive: true });
    tempDir = await fs.mkdtemp(path.join(tmpBase, "adapter-"));

    const appCode = `
import Fastify from "fastify";

export async function buildApp() {
  const app = Fastify({ logger: false });

  app.get("/hello", async (req, reply) => {
    return reply
      .header("x-custom-res", "test-val")
      .send({ message: "world", q: req.query.name || "anon" });
  });

  return app;
}
`;
    await fs.writeFile(path.join(tempDir, "app.mjs"), appCode, "utf-8");

    // Link node_modules so worker resolves fastify
    const rootNodeModules = path.resolve(__dirname, "../../node_modules");
    try {
      const symlinkType = process.platform === "win32" ? "junction" : "dir";
      await fs.symlink(rootNodeModules, path.join(tempDir, "node_modules"), symlinkType);
    } catch {
      // Ignore if exists
    }

    const adapter = new FastifyAdapter();
    expect(adapter.isApplicable("fastify")).toBe(true);
    expect(adapter.isApplicable("express")).toBe(false);

    const probes: HttpProbe[] = [
      {
        id: "probe-hello",
        name: "Hello probe",
        method: "GET",
        path: "/hello",
        query: { name: "Alice" }
      }
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
    const obs = observations[0]!;
    expect(obs.probeId).toBe("probe-hello");
    expect(obs.response?.statusCode).toBe(200);
    expect(obs.response?.headers["x-custom-res"]).toBe("test-val");
    expect(obs.response?.body).toEqual({ message: "world", q: "Alice" });
    expect(obs.durationMs).toBeGreaterThanOrEqual(0);
    expect(obs.error).toBeUndefined();
  });

  it("captures application errors gracefully when endpoint throws", async () => {
    await fs.mkdir(tmpBase, { recursive: true });
    tempDir = await fs.mkdtemp(path.join(tmpBase, "adapter-err-"));

    const appCode = `
import Fastify from "fastify";

export async function buildApp() {
  const app = Fastify({ logger: false });

  app.get("/fail", async (_req, reply) => {
    reply.status(500);
    throw new Error("Internal DB explosion");
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
    const probes: HttpProbe[] = [
      { id: "fail-probe", name: "Fail probe", method: "GET", path: "/fail" }
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
    const obs = observations[0]!;
    expect(obs.response?.statusCode).toBe(500);
    expect(obs.response?.body).toMatchObject({
      error: "Internal Server Error",
      statusCode: 500
    });
  });
});
