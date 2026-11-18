import path from "node:path";
import fs from "node:fs/promises";
import { BehavioralDelta } from "../classification/types.js";
import { Observation } from "../observations/types.js";
import { RunMetadata, RunReport } from "./types.js";

export class EvidenceStore {
  constructor(private readonly baseReportsDir: string) {}

  public async saveRun(report: RunReport): Promise<string> {
    const runDir = path.resolve(this.baseReportsDir, report.metadata.runId);
    await fs.mkdir(runDir, { recursive: true });

    const metadataPath = path.join(runDir, "metadata.json");
    const baselinePath = path.join(runDir, "baseline.json");
    const candidatePath = path.join(runDir, "candidate.json");
    const deltasPath = path.join(runDir, "deltas.json");
    const reportPath = path.join(runDir, "report.json");

    await fs.writeFile(metadataPath, JSON.stringify(report.metadata, null, 2) + "\n", "utf-8");
    await fs.writeFile(baselinePath, JSON.stringify(report.baselineObservations, null, 2) + "\n", "utf-8");
    await fs.writeFile(candidatePath, JSON.stringify(report.candidateObservations, null, 2) + "\n", "utf-8");
    await fs.writeFile(deltasPath, JSON.stringify(report.deltas, null, 2) + "\n", "utf-8");
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf-8");

    // Also update a 'latest.json' pointer
    const latestPath = path.join(path.resolve(this.baseReportsDir), "latest.json");
    await fs.writeFile(
      latestPath,
      JSON.stringify({ latestRunId: report.metadata.runId, timestamp: report.metadata.timestamp }, null, 2) + "\n",
      "utf-8"
    );

    return reportPath;
  }

  public async loadRun(runId: string): Promise<RunReport> {
    const runDir = path.resolve(this.baseReportsDir, runId);
    const reportPath = path.join(runDir, "report.json");

    try {
      const content = await fs.readFile(reportPath, "utf-8");
      return JSON.parse(content) as RunReport;
    } catch {
      throw new Error(`Report not found for run ID: '${runId}' at ${reportPath}`);
    }
  }

  public async getLatestRun(): Promise<RunReport | null> {
    const reportsDir = path.resolve(this.baseReportsDir);
    const latestPointer = path.join(reportsDir, "latest.json");

    try {
      const pointerRaw = await fs.readFile(latestPointer, "utf-8");
      const { latestRunId } = JSON.parse(pointerRaw) as { latestRunId: string };
      if (latestRunId) {
        return await this.loadRun(latestRunId);
      }
    } catch {
      // If latest.json pointer doesn't exist, list subdirectories
    }

    try {
      const entries = await fs.readdir(reportsDir, { withFileTypes: true });
      const dirs = entries
        .filter(e => e.isDirectory() && e.name.startsWith("run_"))
        .map(e => e.name)
        .sort()
        .reverse();

      if (dirs.length > 0 && dirs[0]) {
        return await this.loadRun(dirs[0]);
      }
    } catch {
      // Reports dir might not exist yet
    }

    return null;
  }
}
