import { ExecutionEngine, formatDiffReport, loadConfig } from "@whydiff/core";
import { CliError } from "../errors/cli-error.js";

export interface CiCommandOptions {
  base?: string;
  candidate?: string;
  failOn?: "breaking" | "risky" | "changed" | "never";
  config?: string;
  openapiBaseline?: string;
  openapiCandidate?: string;
  authProfile?: string;
}

export async function runCi(options: CiCommandOptions = {}): Promise<number> {
  const cwd = process.cwd();
  const configPath = options.config || cwd;

  let loaded;
  try {
    loaded = await loadConfig(configPath);
  } catch (err: unknown) {
    throw new CliError(`Configuration error: ${(err as Error).message}`, 2);
  }

  const baseRef = options.base || "main";
  const candidateRef = options.candidate || "HEAD";
  const revisionRange = `${baseRef}..${candidateRef}`;

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
    throw new CliError(`CI execution failed: ${(err as Error).message}`, 2);
  }

  const output = formatDiffReport(report);
  console.log(output);

  const failOn = options.failOn || loaded.config.ci.fail_on || "breaking";

  if (failOn === "never") {
    return 0;
  }

  if (report.metadata.statistics.breakingCount > 0) {
    return 1;
  }

  if (failOn === "risky" && (report.metadata.statistics.riskyCount > 0 || report.metadata.statistics.breakingCount > 0)) {
    return 1;
  }

  if (failOn === "changed" && (
    report.metadata.statistics.changedCount > 0 ||
    report.metadata.statistics.riskyCount > 0 ||
    report.metadata.statistics.breakingCount > 0
  )) {
    return 1;
  }

  return 0;
}
