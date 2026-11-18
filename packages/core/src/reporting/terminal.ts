import { RunReport } from "../evidence/types.js";
import { BehavioralDelta } from "../classification/types.js";
import { ContractDiffResult } from "../openapi/types.js";

export function formatBanner(): string {
  return [
    "  __        __ __   __  ______  ______",
    "  \\ \\      / / \\ \\ / / |  ____| |  __ \\",
    "   \\ \\ /\\ / /   \\ V /  | |__    | |__) |",
    "    \\ V  V /     > <   |  __|   |  _  /",
    "     \\_/\\_/     /_/\\_\\ | |____  | |  / /",
    "                         |______| |_|  \\_\\",
    "",
    "  WHYDIFF v0.1.0 / v0.2.0",
    "  Behavioral Change Detection & Verification",
    "  -----------------------------------------------"
  ].join("\n");
}

export function formatDiffReport(report: RunReport, options: { verbose?: boolean } = {}): string {
  const lines: string[] = [];
  const { metadata, deltas } = report;

  lines.push(formatBanner());
  lines.push("");
  lines.push(`  BASELINE       ${metadata.baseline.ref} (${metadata.baseline.sha.slice(0, 7)})`);
  lines.push(`  CANDIDATE      ${metadata.candidate.ref} (${metadata.candidate.sha.slice(0, 7)})`);
  lines.push("");
  lines.push(`  APPLICATION    ${metadata.project.name}`);
  lines.push(`  FRAMEWORK      ${metadata.project.framework}`);

  if (report.contractDiff) {
    lines.push("");
    lines.push("  OPENAPI CONTRACT DIFFERENCE");
    lines.push(`    Breaking Changes     ${report.contractDiff.breakingCount}`);
    lines.push(`    Risky Changes        ${report.contractDiff.riskyCount}`);
    lines.push(`    Compatible Changes   ${report.contractDiff.changedCount}`);
  }

  lines.push("");
  lines.push("  PROBES");
  lines.push(`    Executed             ${metadata.statistics.probeCount}`);
  lines.push(`    Successful           ${metadata.statistics.successfulProbes}`);
  lines.push(`    Failed                 ${metadata.statistics.failedProbes}`);
  if (metadata.statistics.retriedProbes) {
    lines.push(`    Retried              ${metadata.statistics.retriedProbes}`);
  }
  lines.push("");
  lines.push("  BEHAVIORAL DELTAS");
  lines.push(`    Breaking               ${metadata.statistics.breakingCount}`);
  lines.push(`    Risky                  ${metadata.statistics.riskyCount}`);
  lines.push(`    Changed                ${metadata.statistics.changedCount}`);
  lines.push(`    Informational          ${metadata.statistics.informationalCount}`);
  if (metadata.statistics.unverifiedCount) {
    lines.push(`    Unverified             ${metadata.statistics.unverifiedCount}`);
  }
  lines.push("");
  lines.push("  -------------------------------------------");

  if (deltas.length === 0) {
    lines.push("");
    lines.push("  No behavioral differences detected across revisions.");
    lines.push("");
  } else {
    for (const delta of deltas) {
      lines.push("");
      const tag = delta.verdict ? `[${delta.severity.toUpperCase()} | ${delta.verdict.toUpperCase().replace(/_/g, " ")}]` : `[${delta.severity.toUpperCase()}]`;
      lines.push(`  ${tag} ${delta.id}`);
      lines.push("");
      lines.push(`  ${delta.before.request.method} ${delta.before.request.path}`);
      if (delta.motivatedBy) {
        lines.push(`  Motivated By: ${delta.motivatedBy}`);
      }
      lines.push("");

      // Highlight key differences
      for (const diff of delta.differences) {
        if (diff.kind === "status_changed") {
          lines.push("  HTTP status:");
          lines.push(`    Before: ${diff.beforeValue}`);
          lines.push(`    After:  ${diff.afterValue}`);
        } else if (diff.kind === "removed") {
          lines.push(`  Response field removed:`);
          lines.push(`    Before: ${diff.path}`);
          lines.push(`    After:  missing`);
        } else if (diff.kind === "added") {
          lines.push(`  Response field added:`);
          lines.push(`    Before: missing`);
          lines.push(`    After:  ${JSON.stringify(diff.afterValue)}`);
        } else if (diff.kind === "type_changed") {
          lines.push(`  Field type changed (${diff.path}):`);
          lines.push(`    Before: ${JSON.stringify(diff.beforeValue)}`);
          lines.push(`    After:  ${JSON.stringify(diff.afterValue)}`);
        } else if (diff.kind === "changed") {
          lines.push(`  Field value changed (${diff.path}):`);
          lines.push(`    Before: ${JSON.stringify(diff.beforeValue)}`);
          lines.push(`    After:  ${JSON.stringify(diff.afterValue)}`);
        } else if (diff.kind === "header_changed") {
          lines.push(`  Header changed (${diff.path}):`);
          lines.push(`    Before: ${JSON.stringify(diff.beforeValue ?? "missing")}`);
          lines.push(`    After:  ${JSON.stringify(diff.afterValue ?? "missing")}`);
        } else if (diff.kind === "execution_failed") {
          lines.push("  Execution error:");
          lines.push(`    Before: ${JSON.stringify(diff.beforeValue ?? "none")}`);
          lines.push(`    After:  ${JSON.stringify(diff.afterValue ?? "none")}`);
        }
      }

      if (options.verbose && delta.evidence.length > 0) {
        lines.push("");
        lines.push("  Evidence:");
        for (const ev of delta.evidence) {
          lines.push(`    - ${ev}`);
        }
      }

      lines.push("");
      lines.push("  -------------------------------------------");
    }
  }

  lines.push("");
  lines.push("  ANALYSIS COMPLETE");
  lines.push("");
  lines.push(`  ${deltas.length} behavioral delta(s) detected.`);
  lines.push("");
  lines.push(`  Report:`);
  lines.push(`  .whydiff/reports/${metadata.runId}/report.json`);
  lines.push("");

  return lines.join("\n");
}

export function formatBehaviorReport(report: RunReport): string {
  const lines: string[] = [];
  lines.push(formatDiffReport(report, { verbose: true }));

  lines.push("  DETAILED TECHNICAL PROBE COMPARISON");
  lines.push("  ====================================");
  lines.push("");

  for (let i = 0; i < report.baselineObservations.length; i++) {
    const base = report.baselineObservations[i]!;
    const cand = report.candidateObservations.find(c => c.probeId === base.probeId);

    lines.push(`  Probe [${base.probeId}]: ${base.request.method} ${base.request.path}`);
    if (base.attempts && base.attempts > 1) {
      lines.push(`    Attempts: Baseline ${base.attempts}, Candidate ${cand?.attempts || 1}`);
    }
    lines.push(`    Baseline:  Status ${base.response?.statusCode ?? "ERR"} (${base.durationMs ?? 0}ms)`);
    lines.push(`    Candidate: Status ${cand?.response?.statusCode ?? "ERR"} (${cand?.durationMs ?? 0}ms)`);
    if (base.response?.body !== undefined) {
      lines.push(`    Baseline Body:  ${JSON.stringify(base.response.body)}`);
    }
    if (cand?.response?.body !== undefined) {
      lines.push(`    Candidate Body: ${JSON.stringify(cand.response.body)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function formatContractDiffReport(diff: ContractDiffResult): string {
  const lines: string[] = [];

  lines.push("  OPENAPI CONTRACT COMPARISON");
  lines.push("  ===========================");
  lines.push(`  Baseline:  ${diff.baselineTitle} (v${diff.baselineVersion})`);
  lines.push(`  Candidate: ${diff.candidateTitle} (v${diff.candidateVersion})`);
  lines.push("");
  lines.push(`  Breaking:      ${diff.breakingCount}`);
  lines.push(`  Risky:         ${diff.riskyCount}`);
  lines.push(`  Compatible:    ${diff.changedCount}`);
  lines.push("");
  lines.push("  -------------------------------------------");

  if (diff.deltas.length === 0) {
    lines.push("  No contract differences detected between specifications.");
  } else {
    for (const d of diff.deltas) {
      lines.push(`  [${d.severity.toUpperCase()}] ${d.id}: ${d.description}`);
      lines.push(`    Path:   ${d.method ? `${d.method} ` : ""}${d.path}`);
      lines.push(`    Kind:   ${d.kind}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

export function formatExplainDelta(delta: BehavioralDelta, runId: string): string {
  const lines: string[] = [];

  lines.push(`  EXPLANATION FOR DELTA: ${delta.id}`);
  lines.push(`  ======================================`);
  lines.push("");
  lines.push(`  Identifier:   ${delta.id}`);
  lines.push(`  Title:        ${delta.title}`);
  lines.push(`  Severity:     ${delta.severity.toUpperCase()}`);
  if (delta.verdict) {
    lines.push(`  Verdict:      ${delta.verdict.toUpperCase().replace(/_/g, " ")}`);
  }
  lines.push(`  Confidence:   ${delta.confidence * 100}%`);
  lines.push(`  Endpoint:     ${delta.before.request.method} ${delta.before.request.path}`);
  lines.push(`  Surface:      ${delta.surface.join(", ")}`);
  if (delta.motivatedBy) {
    lines.push(`  Motivated By: Contract Delta ${delta.motivatedBy}`);
  }
  lines.push("");
  lines.push("  Baseline Observation:");
  lines.push(`    Revision:    ${delta.before.revision}`);
  lines.push(`    Timestamp:   ${delta.before.timestamp}`);
  lines.push(`    Status:      ${delta.before.response?.statusCode ?? "None"}`);
  lines.push(`    Latency:     ${delta.before.durationMs ?? 0}ms`);
  lines.push(`    Body:        ${JSON.stringify(delta.before.response?.body, null, 2)}`);
  lines.push("");
  lines.push("  Candidate Observation:");
  lines.push(`    Revision:    ${delta.after.revision}`);
  lines.push(`    Timestamp:   ${delta.after.timestamp}`);
  lines.push(`    Status:      ${delta.after.response?.statusCode ?? "None"}`);
  lines.push(`    Latency:     ${delta.after.durationMs ?? 0}ms`);
  lines.push(`    Body:        ${JSON.stringify(delta.after.response?.body, null, 2)}`);
  lines.push("");
  lines.push("  Exact Differences:");
  for (const diff of delta.differences) {
    lines.push(`    - Path: ${diff.path}`);
    lines.push(`      Kind: ${diff.kind}`);
    lines.push(`      Before: ${JSON.stringify(diff.beforeValue)}`);
    lines.push(`      After:  ${JSON.stringify(diff.afterValue)}`);
  }
  lines.push("");
  lines.push("  Evidence References:");
  for (const ev of delta.evidence) {
    lines.push(`    - ${ev}`);
  }
  lines.push("");
  lines.push("  Observed Impact:");
  lines.push(`    ${delta.title}.`);
  lines.push("    This finding is directly derived from executed HTTP probes against baseline and candidate revisions.");
  lines.push("");
  lines.push("  Limitations:");
  lines.push("    Phase 1 compares HTTP responses observed via configured & generated probes and OpenAPI contracts.");
  lines.push("    It does not infer external database side-effects or business-level consequences.");
  lines.push("");
  lines.push(`  Report Source: .whydiff/reports/${runId}/report.json`);
  lines.push("");

  return lines.join("\n");
}
