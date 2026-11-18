import path from "node:path";
import fs from "node:fs/promises";
import chalk from "chalk";
import Table from "cli-table3";
import {
  parseOpenApiSpec,
  generateProbesFromOpenApi,
  loadConfig,
  loadProbes
} from "@whydiff/core";
import { CliError } from "../errors/cli-error.js";

export interface ProbeGenerateOptions {
  output?: string;
  validOnly?: boolean;
  invalidOnly?: boolean;
  limit?: string;
  json?: boolean;
}

export interface ProbeListOptions {
  config?: string;
  json?: boolean;
}

export async function runProbeGenerate(
  specPath: string,
  options: ProbeGenerateOptions = {}
): Promise<void> {
  const resolvedPath = path.resolve(process.cwd(), specPath);
  let parsed;
  try {
    parsed = await parseOpenApiSpec(resolvedPath);
  } catch (err: unknown) {
    throw new CliError(`Failed to parse OpenAPI specification: ${(err as Error).message}`, 2);
  }

  const maxProbes = options.limit ? parseInt(options.limit, 10) : undefined;
  const probes = generateProbesFromOpenApi(parsed, {
    validOnly: options.validOnly,
    invalidOnly: options.invalidOnly,
    maxProbesPerEndpoint: maxProbes
  });

  if (options.output) {
    const outputPath = path.resolve(process.cwd(), options.output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(probes, null, 2), "utf8");
    console.log(chalk.green(`  Generated ${probes.length} probes written to ${options.output}`));
  }

  if (options.json) {
    console.log(JSON.stringify(probes, null, 2));
    return;
  }

  console.log(chalk.bold("\n  SCHEMA-AWARE PROBE GENERATION"));
  console.log("  =============================");
  console.log(`  Source Spec:    ${parsed.info?.title || "OpenAPI Spec"} (${specPath})`);
  console.log(`  Total Probes:   ${probes.length}`);
  const validCount = probes.filter(p => !p.tags?.includes("invalid-schema") && !p.tags?.includes("missing-field")).length;
  const invalidCount = probes.length - validCount;
  console.log(`  Valid Probes:   ${validCount}`);
  console.log(`  Negative Probes:${invalidCount}`);
  console.log("");

  const table = new Table({
    head: [chalk.bold("Probe ID"), chalk.bold("Method"), chalk.bold("Path"), chalk.bold("Category"), chalk.bold("Tags")],
    colWidths: [28, 10, 24, 18, 20]
  });

  for (const p of probes) {
    const isNegative = p.tags?.includes("invalid-schema") || p.tags?.includes("missing-field");
    table.push([
      p.id,
      chalk.green(p.method),
      p.path,
      isNegative ? chalk.yellow("Negative/Boundary") : chalk.cyan("Normal/Valid"),
      (p.tags || []).join(", ")
    ]);
  }

  console.log(table.toString());
  console.log("");
}

export async function runProbeList(options: ProbeListOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const configPath = options.config || cwd;

  let loaded;
  try {
    loaded = await loadConfig(configPath);
  } catch (err: unknown) {
    throw new CliError(`Configuration error: ${(err as Error).message}`, 2);
  }

  let probes;
  try {
    probes = await loadProbes(loaded.config.probes.file, loaded.rootDir);
  } catch (err: unknown) {
    throw new CliError(`Probe loading error: ${(err as Error).message}`, 2);
  }

  if (options.json) {
    console.log(JSON.stringify(probes, null, 2));
    return;
  }

  console.log(chalk.bold("\n  CONFIGURED PROBES"));
  console.log("  =================");
  console.log(`  Total Probes: ${probes.length}`);
  console.log("");

  const table = new Table({
    head: [chalk.bold("ID"), chalk.bold("Method"), chalk.bold("Path"), chalk.bold("Name"), chalk.bold("Tags")],
    colWidths: [24, 10, 24, 25, 18]
  });

  for (const p of probes) {
    table.push([
      p.id,
      chalk.green(p.method),
      p.path,
      p.name || "",
      (p.tags || []).join(", ")
    ]);
  }

  console.log(table.toString());
  console.log("");
}
