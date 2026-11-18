import path from "node:path";
import { ExecutionEngine, formatDiffReport, loadConfig } from "@whydiff/core";
import { CliError } from "../errors/cli-error.js";

export interface DiffCommandOptions {
  config?: string;
  verbose?: boolean;
}

export async function runDiff(revisionRange: string, options: DiffCommandOptions = {}): Promise<number> {
  const cwd = process.cwd();
  const configPath = options.config || cwd;

  let loaded;
  try {
    loaded = await loadConfig(configPath);
  } catch (err: unknown) {
    throw new CliError(`Configuration error: ${(err as Error).message}`, 2);
  }

  const engine = new ExecutionEngine();
  let report;
  try {
    report = await engine.execute({
      config: loaded.config,
      rootDir: loaded.rootDir,
      revisionRange
    });
  } catch (err: unknown) {
    throw new CliError(`Diff execution failed: ${(err as Error).message}`, 2);
  }

  const output = formatDiffReport(report, { verbose: options.verbose });
  console.log(output);

  // Return exit code 1 if breaking changes detected, otherwise 0
  if (report.metadata.statistics.breakingCount > 0) {
    return 1;
  }
  return 0;
}
