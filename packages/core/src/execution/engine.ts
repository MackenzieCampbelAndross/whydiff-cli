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
import { loadOpenApi } from "../openapi/parser.js";
import { compareOpenApi } from "../openapi/differ.js";
import { ContractDiffResult, OpenApiSpec } from "../openapi/types.js";
import { generateProbesFromSpec } from "../probes/generator/generator.js";
import { generateDifferentialProbes } from "../probes/generator/differential.js";

export interface ExecutionOptions {
  config: WhydiffConfig;
  rootDir: string;
  revisionRange: string;
  worktreesDir?: string;
  openapiBaseline?: string;
  openapiCandidate?: string;
  authProfile?: string;
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

    // 3. Load & Generate Probes
    let probes: HttpProbe[] = [];

    // Load static probes file if it exists
    try {
      const staticProbes = await loadProbes(options.config.probes.file, rootDir);
      probes.push(...staticProbes);
    } catch (err) {
      // If static probe file doesn't exist but openapi is configured, continue
      if (!options.config.openapi && !options.openapiCandidate) {
        throw err;
      }
    }

    // Process OpenAPI contracts if provided
    let contractDiff: ContractDiffResult | undefined;
    let baseSpec: OpenApiSpec | undefined;
    let candSpec: OpenApiSpec | undefined;

    const baseSpecPath = options.openapiBaseline || options.config.openapi?.baseline || options.config.openapi?.spec;
    const candSpecPath = options.openapiCandidate || options.config.openapi?.candidate || options.config.openapi?.spec;

    if (baseSpecPath && candSpecPath) {
      try {
        baseSpec = await loadOpenApi(baseSpecPath, rootDir);
        candSpec = await loadOpenApi(candSpecPath, rootDir);
        contractDiff = compareOpenApi(baseSpec, candSpec);

        // Differential probe generation
        const diffProbes = generateDifferentialProbes(contractDiff, baseSpec, candSpec);
        probes.push(...diffProbes);
      } catch {
        // Continue if spec loading fails
      }
    } else if (candSpecPath) {
      try {
        candSpec = await loadOpenApi(candSpecPath, rootDir);
      } catch {
        // Continue
      }
    }

    // Schema-aware probe generation from spec
    if (candSpec && (options.config.probes.generation.enabled || probes.length === 0)) {
      const generated = generateProbesFromSpec(candSpec, {
        includeInvalid: options.config.probes.generation.include_invalid,
        maxProbesPerEndpoint: options.config.probes.generation.max_per_endpoint,
        maxDepth: options.config.probes.generation.max_depth
      });
      probes.push(...generated);
    }

    if (probes.length === 0) {
      throw new Error("No probes found or generated to execute");
    }

    // Deduplicate probes by id
    const uniqueProbesMap = new Map<string, HttpProbe>();
    for (const p of probes) {
      uniqueProbesMap.set(p.id, p);
    }
    const finalProbes = Array.from(uniqueProbesMap.values()).sort((a, b) => a.id.localeCompare(b.id));

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

    // Resolve Auth Profiles
    const baseProfileName = options.authProfile || options.config.auth?.baseline_profile || options.config.auth?.default_profile;
    const candProfileName = options.authProfile || options.config.auth?.candidate_profile || options.config.auth?.default_profile;
    const baseAuthProfile = (baseProfileName && options.config.auth?.profiles) ? options.config.auth.profiles[baseProfileName] : undefined;
    const candAuthProfile = (candProfileName && options.config.auth?.profiles) ? options.config.auth.profiles[candProfileName] : undefined;

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
        finalProbes,
        timeoutMs,
        baseRef,
        {
          authProfile: baseAuthProfile,
          reliability: options.config.reliability
        }
      );

      // 7. Execute probes against candidate
      rawCandidateObservations = await adapter.executeProbes(
        isolated.candidate.worktreePath,
        entrypoint,
        exportName,
        finalProbes,
        timeoutMs,
        candidateRef,
        {
          authProfile: candAuthProfile,
          reliability: options.config.reliability
        }
      );
    } finally {
      // 8. Safely cleanup worktrees
      await isolated.cleanup();
    }

    // 9. Normalize observations
    const normOptions = {
      includeHeaders: options.config.comparison.include_headers,
      ignoreHeaders: options.config.comparison.ignore_headers,
      redactSensitive: true,
      sensitiveFields: options.config.auth?.redact_fields || []
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

    // Sort deltas by severity precedence: breaking -> risky -> changed -> informational -> unverified
    const severityRank: Record<string, number> = {
      breaking: 0,
      risky: 1,
      changed: 2,
      informational: 3,
      unverified: 4
    };
    deltas.sort((a, b) => (severityRank[a.severity] ?? 99) - (severityRank[b.severity] ?? 99));

    // Re-index delta IDs sequentially after sorting
    for (let i = 0; i < deltas.length; i++) {
      deltas[i]!.id = `bd_${String(i + 1).padStart(3, "0")}`;
    }

    // 11. Calculate statistics
    const successfulProbes = normBaseline.filter(b => !b.error).length;
    const failedProbes = normBaseline.filter(b => !!b.error).length;
    const retriedProbes = normCandidate.filter(c => (c.attempts || 1) > 1).length;

    const breakingCount = deltas.filter(d => d.severity === "breaking").length;
    const riskyCount = deltas.filter(d => d.severity === "risky").length;
    const changedCount = deltas.filter(d => d.severity === "changed").length;
    const informationalCount = deltas.filter(d => d.severity === "informational").length;
    const unverifiedCount = deltas.filter(d => d.severity === "unverified").length;

    const metadata: RunMetadata = {
      runId,
      version: "0.2.0",
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
        probeCount: finalProbes.length,
        successfulProbes,
        failedProbes,
        deltaCount: deltas.length,
        breakingCount,
        riskyCount,
        changedCount,
        informationalCount,
        unverifiedCount,
        retriedProbes
      },
      contractDiff,
      authProfilesUsed: {
        baseline: baseProfileName,
        candidate: candProfileName
      }
    };

    const report: RunReport = {
      metadata,
      deltas,
      baselineObservations: normBaseline,
      candidateObservations: normCandidate,
      contractDiff
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
