import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { loadProbes, ProbeLoadError, HttpProbeSchema } from "@whydiff/core";

describe("Unit: Probes Engine", () => {
  it("validates valid HTTP probe schema", () => {
    const probe = {
      id: "get-users",
      name: "Get Users List",
      method: "GET",
      path: "/users",
      headers: { "x-tenant": "acme" },
      query: { limit: "10" },
      tags: ["users", "v1"]
    };

    const parsed = HttpProbeSchema.parse(probe);
    expect(parsed.id).toBe("get-users");
    expect(parsed.method).toBe("GET");
    expect(parsed.path).toBe("/users");
    expect(parsed.headers).toEqual({ "x-tenant": "acme" });
  });

  it("defaults method to GET if omitted", () => {
    const probe = {
      id: "simple-probe",
      name: "Simple",
      path: "/health"
    };

    const parsed = HttpProbeSchema.parse(probe);
    expect(parsed.method).toBe("GET");
  });

  it("rejects probe path without leading slash", () => {
    const probe = {
      id: "invalid-path",
      name: "Invalid",
      path: "health"
    };

    expect(() => HttpProbeSchema.parse(probe)).toThrowError(/Probe path must begin with '\/'/);
  });

  it("loads probes from JSON and sorts deterministically by id", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "whydiff-probes-"));
    const probesFile = path.join(tempDir, "probes.json");

    const content = {
      probes: [
        { id: "z-probe", name: "Z", method: "GET", path: "/z" },
        { id: "a-probe", name: "A", method: "GET", path: "/a" },
        { id: "m-probe", name: "M", method: "POST", path: "/m", payload: { x: 1 } }
      ]
    };

    await fs.writeFile(probesFile, JSON.stringify(content), "utf-8");

    const loaded = await loadProbes("probes.json", tempDir);
    expect(loaded).toHaveLength(3);
    expect(loaded[0]!.id).toBe("a-probe");
    expect(loaded[1]!.id).toBe("m-probe");
    expect(loaded[2]!.id).toBe("z-probe");

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("rejects duplicate probe IDs", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "whydiff-probes-"));
    const probesFile = path.join(tempDir, "probes.json");

    const content = {
      probes: [
        { id: "dup-probe", name: "First", method: "GET", path: "/first" },
        { id: "dup-probe", name: "Second", method: "GET", path: "/second" }
      ]
    };

    await fs.writeFile(probesFile, JSON.stringify(content), "utf-8");

    await expect(loadProbes("probes.json", tempDir)).rejects.toThrowError(
      /Duplicate probe id detected: 'dup-probe'/
    );

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("rejects empty probes list", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "whydiff-probes-"));
    const probesFile = path.join(tempDir, "probes.json");

    await fs.writeFile(probesFile, JSON.stringify({ probes: [] }), "utf-8");

    await expect(loadProbes("probes.json", tempDir)).rejects.toThrowError(
      /At least one probe must be configured/
    );

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
