import fs from "node:fs/promises";
import path from "node:path";
import { stringify as stringifyToml } from "smol-toml";
import { WhydiffConfig, WhydiffConfigSchema } from "./types.js";

export interface InitProjectOptions {
  name?: string;
  framework?: "fastify";
  entrypoint?: string;
  exportName?: string;
  rootDir: string;
  overwrite?: boolean;
}

export function getDefaultConfig(name = "my-service", entrypoint = "src/app.ts", exportName = "buildApp"): WhydiffConfig {
  return WhydiffConfigSchema.parse({
    version: 1,
    project: {
      name,
      framework: "fastify"
    },
    application: {
      entrypoint,
      export: exportName
    },
    comparison: {
      timeout_ms: 10000,
      include_headers: ["content-type", "cache-control"],
      ignore_headers: [
        "date",
        "x-request-id",
        "etag",
        "last-modified",
        "transfer-encoding",
        "connection",
        "keep-alive"
      ]
    },
    execution: {
      install_dependencies: true,
      cleanup_worktrees: true
    },
    probes: {
      file: ".whydiff/probes.json",
      generation: {
        enabled: false,
        max_per_endpoint: 6,
        include_invalid: true,
        max_depth: 4
      }
    },
    auth: {
      profiles: {}
    },
    reliability: {
      max_retries: 2,
      initial_delay_ms: 50,
      max_delay_ms: 500,
      backoff_factor: 2,
      retry_on_status: [502, 503, 504],
      retry_on_network_error: true
    },
    report: {
      directory: ".whydiff/reports",
      format: "terminal"
    },
    ci: {
      fail_on: "breaking"
    }
  });
}

export function generateTomlConfig(config: WhydiffConfig): string {
  return [
    "# WHYDIFF Configuration",
    "# Behavioral Change Detection & Verification",
    "",
    `version = ${config.version}`,
    "",
    "[project]",
    `name = "${config.project.name}"`,
    `framework = "${config.project.framework}"`,
    "",
    "[application]",
    `entrypoint = "${config.application.entrypoint}"`,
    `export = "${config.application.export}"`,
    "",
    "[comparison]",
    `timeout_ms = ${config.comparison.timeout_ms}`,
    `include_headers = ${JSON.stringify(config.comparison.include_headers)}`,
    `ignore_headers = ${JSON.stringify(config.comparison.ignore_headers)}`,
    "",
    "[execution]",
    `install_dependencies = ${config.execution.install_dependencies}`,
    `cleanup_worktrees = ${config.execution.cleanup_worktrees}`,
    "",
    "[probes]",
    `file = "${config.probes.file}"`,
    "",
    "[report]",
    `directory = "${config.report.directory}"`,
    `format = "${config.report.format}"`,
    "",
    "[ci]",
    `fail_on = "${config.ci.fail_on}"`,
    ""
  ].join("\n");
}

export function getDefaultProbes() {
  return {
    probes: [
      {
        id: "health-check",
        name: "Health endpoint check",
        method: "GET",
        path: "/health",
        tags: ["smoke", "health"]
      }
    ]
  };
}

export async function initProject(options: InitProjectOptions): Promise<{ configPath: string; probesPath: string; created: boolean }> {
  const rootDir = path.resolve(options.rootDir);
  const configPath = path.join(rootDir, ".whydiff.toml");
  const probesDir = path.join(rootDir, ".whydiff");
  const probesPath = path.join(rootDir, ".whydiff", "probes.json");

  let exists = false;
  try {
    await fs.stat(configPath);
    exists = true;
  } catch {
    exists = false;
  }

  if (exists && !options.overwrite) {
    throw new Error(`Configuration file already exists at ${configPath}. Use --overwrite to replace it.`);
  }

  const config = getDefaultConfig(
    options.name || path.basename(rootDir),
    options.entrypoint || "src/app.ts",
    options.exportName || "buildApp"
  );

  const tomlContent = generateTomlConfig(config);
  await fs.writeFile(configPath, tomlContent, "utf-8");

  await fs.mkdir(probesDir, { recursive: true });

  let probesExist = false;
  try {
    await fs.stat(probesPath);
    probesExist = true;
  } catch {
    probesExist = false;
  }

  if (!probesExist || options.overwrite) {
    await fs.writeFile(probesPath, JSON.stringify(getDefaultProbes(), null, 2) + "\n", "utf-8");
  }

  return {
    configPath,
    probesPath,
    created: true
  };
}
