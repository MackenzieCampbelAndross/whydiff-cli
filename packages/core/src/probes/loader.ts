import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import { HttpProbe, ProbesFile, ProbesFileSchema } from "./types.js";

export class ProbeLoadError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = "ProbeLoadError";
  }
}

export async function loadProbes(probesFilePath: string, rootDir: string): Promise<HttpProbe[]> {
  const resolved = path.isAbsolute(probesFilePath)
    ? probesFilePath
    : path.resolve(rootDir, probesFilePath);

  let rawContent: string;
  try {
    rawContent = await fs.readFile(resolved, "utf-8");
  } catch (err) {
    throw new ProbeLoadError(`Failed to read probes file at ${resolved}: ${(err as Error).message}`);
  }

  let parsed: unknown;
  if (resolved.endsWith(".toml")) {
    try {
      parsed = parseToml(rawContent);
    } catch (err) {
      throw new ProbeLoadError(`Failed to parse TOML in ${resolved}: ${(err as Error).message}`);
    }
  } else {
    try {
      parsed = JSON.parse(rawContent);
    } catch (err) {
      throw new ProbeLoadError(`Failed to parse JSON in ${resolved}: ${(err as Error).message}`);
    }
  }

  const result = ProbesFileSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  - [${i.path.join(".")}]: ${i.message}`)
      .join("\n");
    throw new ProbeLoadError(`Invalid probe definitions in ${resolved}:\n${issues}`, result.error.issues);
  }

  // Ensure probe IDs are unique and sorted deterministically
  const seenIds = new Set<string>();
  for (const probe of result.data.probes) {
    if (seenIds.has(probe.id)) {
      throw new ProbeLoadError(`Duplicate probe id detected: '${probe.id}' in ${resolved}`);
    }
    seenIds.add(probe.id);
  }

  // Stable deterministic order by probe id
  return [...result.data.probes].sort((a, b) => a.id.localeCompare(b.id));
}
