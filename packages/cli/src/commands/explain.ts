import path from "node:path";
import { EvidenceStore, formatExplainDelta, loadConfig } from "@whydiff/core";
import { CliError } from "../errors/cli-error.js";

export interface ExplainCommandOptions {
  run?: string;
  config?: string;
}

export async function runExplain(deltaId: string, options: ExplainCommandOptions = {}): Promise<void> {
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

  const delta = report.deltas.find(d => d.id.toLowerCase() === deltaId.toLowerCase());
  if (!delta) {
    const available = report.deltas.map(d => d.id).join(", ");
    throw new CliError(
      `Delta '${deltaId}' not found in run '${report.metadata.runId}'. Available deltas: [${available || "none"}]`,
      2
    );
  }

  const output = formatExplainDelta(delta, report.metadata.runId);
  console.log(output);
}
