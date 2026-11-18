import { ExecutionEngine, formatBehaviorReport, loadConfig } from "@whydiff/core";
import { CliError } from "../errors/cli-error.js";

export interface BehaviorCommandOptions {
  config?: string;
  openapiBaseline?: string;
  openapiCandidate?: string;
  authProfile?: string;
}

export async function runBehavior(revisionRange: string, options: BehaviorCommandOptions = {}): Promise<number> {
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
      revisionRange,
      openapiBaseline: options.openapiBaseline,
      openapiCandidate: options.openapiCandidate,
      authProfile: options.authProfile
    });
  } catch (err: unknown) {
    throw new CliError(`Behavior execution failed: ${(err as Error).message}`, 2);
  }

  const output = formatBehaviorReport(report);
  console.log(output);

  if (report.metadata.statistics.breakingCount > 0) {
    return 1;
  }
  return 0;
}
