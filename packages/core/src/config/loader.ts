import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import { WhydiffConfig, WhydiffConfigSchema } from "./types.js";

export class ConfigError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = "ConfigError";
  }
}

export async function findConfigFile(startDir: string): Promise<string | null> {
  let current = path.resolve(startDir);
  while (true) {
    const candidates = [
      path.join(current, ".whydiff.toml"),
      path.join(current, "whydiff.toml")
    ];

    for (const candidate of candidates) {
      try {
        const stat = await fs.stat(candidate);
        if (stat.isFile()) {
          return candidate;
        }
      } catch {
        // File does not exist, continue
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

export async function loadConfig(configPathOrDir: string): Promise<{ config: WhydiffConfig; configPath: string; rootDir: string }> {
  let resolvedPath = path.resolve(configPathOrDir);
  let isDirectory = false;

  try {
    const stat = await fs.stat(resolvedPath);
    isDirectory = stat.isDirectory();
  } catch {
    throw new ConfigError(`Configuration path does not exist: ${resolvedPath}`);
  }

  if (isDirectory) {
    const found = await findConfigFile(resolvedPath);
    if (!found) {
      throw new ConfigError(`No .whydiff.toml configuration found in ${resolvedPath} or its parent directories`);
    }
    resolvedPath = found;
  }

  const rawContent = await fs.readFile(resolvedPath, "utf-8");
  return parseConfigString(rawContent, resolvedPath);
}

export function parseConfigString(content: string, filePath = ".whydiff.toml"): { config: WhydiffConfig; configPath: string; rootDir: string } {
  let parsedRaw: unknown;
  try {
    parsedRaw = parseToml(content);
  } catch (err) {
    throw new ConfigError(`Failed to parse TOML configuration from ${filePath}: ${(err as Error).message}`, err);
  }

  const result = WhydiffConfigSchema.safeParse(parsedRaw);
  if (!result.success) {
    const issueMessages = result.error.issues
      .map(issue => `  - [${issue.path.join(".")}]: ${issue.message}`)
      .join("\n");
    throw new ConfigError(`Invalid configuration in ${filePath}:\n${issueMessages}`, result.error.issues);
  }

  const rootDir = path.dirname(path.resolve(filePath));
  return {
    config: result.data,
    configPath: path.resolve(filePath),
    rootDir
  };
}
