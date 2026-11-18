import path from "node:path";
import { WhydiffConfig } from "../config/types.js";
import { HttpProbe } from "../probes/types.js";
import { loadProbes } from "../probes/loader.js";
import { getGitRoot, isGitRepo, parseRevisionRange, resolveRevision } from "../git/cli.js";
import { RevisionManager } from "../revisions/manager.js";
import { FastifyAdapter } from "../adapters/fastify/adapter.js";
import { normalizeObservation } from "../observations/normalizer.js";
import { compareObservations } from "../comparison/differ.js";
import { classifyDelta } from "../classification/classifier.js";
import { BehavioralDelta } from "../classification/types.js";
import { RunMetadata, RunReport } from "../evidence/types.js";
import { EvidenceStore } from "../evidence/store.js";
import { Observation } from "../observations/types.js";

export interface ExecutionOptions {
  config: WhydiffConfig;
  rootDir: string;
  revisionRange: string;
  worktreesDir?: string;
}

export class ExecutionEngine {
  public async execute(options: ExecutionOptions): Promise<RunReport> {
    const startTime = Date.now();
    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const rootDir = path.resolve(options.rootDir);

    // 1. Verify Git repository
    const isRepo = await isGitRepo(rootDir);
    if (!isRepo) {
      throw new Error(`Directory '${rootDir}' is not a Git repository`);
    }
    const gitRoot = await getGitRoot(rootDir);

    // 2. Parse revision range and resolve commits
    const { baseRef, candidateRef } = parseRevisionRange(options.revisionRange);
    const baseSha = await resolveRevision(baseRef, gitRoot);
    const candidateSha = await resolveRevision(candidateRef, gitRoot);

    // 3. Load probes
    const probes = await loadProbes(options.config.probes.file, rootDir);
    if (probes.length === 0) {
      throw new Error("No probes found to execute");
    }

    // 4. Set up revision isolation
    const worktreesBaseDir = options.worktreesDir
      ? path.resolve(options.worktreesDir)
      : path.join(gitRoot, ".whydiff", "worktrees");

    const revisionManager = new RevisionManager(gitRoot, worktreesBaseDir, {
      installDependencies: options.config.execution.install_dependencies,
      cleanup: options.config.execution.cleanup_worktrees
    });

    const isolated = await revisionManager.isolateRevisions(
      runId,
      { ref: baseRef, sha: baseSha },
      { ref: candidateRef, sha: candidateSha }
    );

    let rawBaselineObservations: Observation[] = [];
    let rawCandidateObservations: Observation[] = [];

    try {
      // 5. Select application adapter
      const adapter = new FastifyAdapter();
      if (!adapter.isApplicable(options.config.project.framework)) {
        throw new Error(`Unsupported framework '${options.config.project.framework}'`);
      }

      const timeoutMs = options.config.comparison.timeout_ms;
      const entrypoint = options.config.application.entrypoint;
      const exportName = options.config.application.export;

      // 6. Execute probes against baseline
      rawBaselineObservations = await adapter.executeProbes(
        isolated.baseline.worktreePath,
        entrypoint,
        exportName,
        probes,
        timeoutMs,
        baseRef
      );

      // 7. Execute probes against candidate
      rawCandidateObservations = await adapter.executeProbes(
        isolated.candidate.worktreePath,
        entrypoint,
        exportName,
        probes,
        timeoutMs,
        candidateRef
      );
    } finally {
      // 8. Safely cleanup worktrees
      await isolated.cleanup();
    }

    // 9. Normalize observations
    const normOptions = {
      includeHeaders: options.config.comparison.include_headers,
      ignoreHeaders: options.config.comparison.ignore_headers,
      redactSensitive: true
    };

    const normBaseline = rawBaselineObservations.map(obs => normalizeObservation(obs, normOptions));
    const normCandidate = rawCandidateObservations.map(obs => normalizeObservation(obs, normOptions));

    // 10. Compare observations and classify deltas
    const deltas: BehavioralDelta[] = [];
    let deltaIndex = 0;

    for (const baseObs of normBaseline) {
      const candObs = normCandidate.find(c => c.probeId === baseObs.probeId);
      if (!candObs) {
        continue;
      }

      const comparison = compareObservations(baseObs, candObs);
      if (comparison.hasDifferences) {
        const delta = classifyDelta(deltaIndex++, baseObs, candObs, comparison.differences);
        deltas.push(delta);
      }
    }

    // Sort deltas by severity precedence: breaking -> risky -> changed -> informational
    const severityRank: Record<string, number> = {
      breaking: 0,
      risky: 1,
      changed: 2,
      informational: 3
    };
    deltas.sort((a, b) => (severityRank[a.severity] ?? 99) - (severityRank[b.severity] ?? 99));

    // Re-index delta IDs sequentially after sorting
    for (let i = 0; i < deltas.length; i++) {
      deltas[i]!.id = `bd_${String(i + 1).padStart(3, "0")}`;
    }

    // 11. Calculate statistics
    const successfulProbes = normBaseline.filter(b => !b.error).length;
    const failedProbes = normBaseline.filter(b => !!b.error).length;

    const breakingCount = deltas.filter(d => d.severity === "breaking").length;
    const riskyCount = deltas.filter(d => d.severity === "risky").length;
    const changedCount = deltas.filter(d => d.severity === "changed").length;
    const informationalCount = deltas.filter(d => d.severity === "informational").length;

    const metadata: RunMetadata = {
      runId,
      version: "0.1.0",
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      project: {
        name: options.config.project.name,
        framework: options.config.project.framework
      },
      baseline: {
        ref: baseRef,
        sha: baseSha
      },
      candidate: {
        ref: candidateRef,
        sha: candidateSha
      },
      statistics: {
        probeCount: probes.length,
        successfulProbes,
        failedProbes,
        deltaCount: deltas.length,
        breakingCount,
        riskyCount,
        changedCount,
        informationalCount
      }
    };

    const report: RunReport = {
      metadata,
      deltas,
      baselineObservations: normBaseline,
      candidateObservations: normCandidate
    };

    // 12. Save evidence to reports directory
    const reportsDir = path.isAbsolute(options.config.report.directory)
      ? options.config.report.directory
      : path.resolve(rootDir, options.config.report.directory);

    const store = new EvidenceStore(reportsDir);
    await store.saveRun(report);

    return report;
  }
}
