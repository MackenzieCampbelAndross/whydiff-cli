import path from "node:path";
import { EvidenceStore, formatDiffReport, loadConfig } from "@whydiff/core";
import { CliError } from "../errors/cli-error.js";

export interface ReportCommandOptions {
  run?: string;
  format?: "terminal" | "json";
  config?: string;
}

export async function runReport(options: ReportCommandOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const configPath = options.config || cwd;

  let loaded;
  try {
    loaded = await loadConfig(configPath);
  } catch (err: unknown) {
    throw new CliError(`Configuration error: ${(err as Error).message}`, 2);
  }

  const reportsDir = path.isAbsolute(loaded.config.report.directory)
    ? loaded.config.report.directory
    : path.resolve(loaded.rootDir, loaded.config.report.directory);

  const store = new EvidenceStore(reportsDir);

  let report;
  try {
    if (options.run) {
      report = await store.loadRun(options.run);
    } else {
      report = await store.getLatestRun();
    }
  } catch (err: unknown) {
    throw new CliError(`Failed to load report: ${(err as Error).message}`, 2);
  }

  if (!report) {
    throw new CliError("No analysis runs found. Run 'whydiff diff <revisions>' first.", 2);
  }

  const format = options.format || loaded.config.report.format || "terminal";

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatDiffReport(report, { verbose: true }));
  }
}
