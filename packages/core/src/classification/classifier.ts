import { Observation } from "../observations/types.js";
import { ValueDifference } from "../comparison/types.js";
import { BehavioralDelta, CompatibilityVerdict, DeltaSeverity } from "./types.js";

export function classifyDelta(
  index: number,
  before: Observation,
  after: Observation,
  differences: ValueDifference[]
): BehavioralDelta {
  const id = `bd_${String(index + 1).padStart(3, "0")}`;
  const severity = determineSeverity(before, after, differences);
  const verdict = determineVerdict(severity, before, after);
  const title = generateTitle(before, after, differences, severity, verdict);
  const evidence = generateEvidence(before, after, differences, verdict);

  return {
    id,
    title,
    severity,
    confidence: severity === "unverified" ? 0.5 : 1.0,
    surface: ["http"],
    before,
    after,
    differences,
    evidence,
    affectedCode: [],
    createdAt: new Date().toISOString(),
    verdict,
    motivatedBy: after.motivatedBy || before.motivatedBy,
    category: after.category || before.category,
    intent: after.intent || before.intent
  };
}

function determineSeverity(
  before: Observation,
  after: Observation,
  differences: ValueDifference[]
): DeltaSeverity {
  // If baseline had execution failure/timeout, we cannot verify baseline expectation
  if (before.error && !before.response) {
    return "unverified";
  }

  // If candidate had execution failure/timeout
  if (!before.error && after.error) {
    return "breaking";
  }

  const beforeStatus = before.response?.statusCode;
  const afterStatus = after.response?.statusCode;

  // Endpoint was 2xx, now is 4xx or 5xx
  if (beforeStatus !== undefined && afterStatus !== undefined) {
    // If probe was deliberately invalid to test validation (intent: validation_error)
    if (after.category === "invalid" || after.intent === "validation_error") {
      // If candidate returns 400 (proper validation) and baseline returned 500 (crash), this is an improvement
      if (beforeStatus === 500 && afterStatus === 400) {
        return "changed";
      }
      // If candidate returns 200 (accepted bad input!) but baseline returned 400, that is risky/breaking
      if (beforeStatus === 400 && afterStatus === 200) {
        return "risky";
      }
    }

    if (beforeStatus >= 200 && beforeStatus < 300 && afterStatus >= 400) {
      return "breaking";
    }

    // Auth differences: 200 -> 401/403 or 401 -> 403
    if (beforeStatus === 200 && (afterStatus === 401 || afterStatus === 403)) {
      return "breaking";
    }
  }

  // Check differences
  let hasTypeChange = false;
  let hasRemoval = false;
  let hasStatusChange = false;
  let hasHeaderChange = false;
  let hasAddition = false;
  let hasValueChange = false;

  for (const diff of differences) {
    if (diff.kind === "type_changed") hasTypeChange = true;
    if (diff.kind === "removed") hasRemoval = true;
    if (diff.kind === "status_changed") hasStatusChange = true;
    if (diff.kind === "header_changed") hasHeaderChange = true;
    if (diff.kind === "added") hasAddition = true;
    if (diff.kind === "changed") hasValueChange = true;
  }

  if (hasTypeChange) {
    return "breaking";
  }

  if (hasRemoval) {
    if (beforeStatus && beforeStatus >= 200 && beforeStatus < 300) {
      return "breaking";
    }
    return "risky";
  }

  if (hasStatusChange) {
    return "risky";
  }

  if (hasValueChange || hasHeaderChange || hasAddition) {
    return "changed";
  }

  return "informational";
}

function determineVerdict(
  severity: DeltaSeverity,
  before: Observation,
  after: Observation
): CompatibilityVerdict {
  const motivatedBy = after.motivatedBy || before.motivatedBy;

  if (severity === "unverified") {
    return "unverified_risk";
  }

  if (motivatedBy) {
    if (severity === "breaking" || severity === "risky") {
      return "confirmed_regression";
    }
    return "contract_incompatibility";
  }

  if (severity === "breaking") {
    return "runtime_divergence";
  }

  return "compatible_behavior";
}

function generateTitle(
  before: Observation,
  after: Observation,
  differences: ValueDifference[],
  severity: DeltaSeverity,
  verdict: CompatibilityVerdict
): string {
  const method = after.request.method || before.request.method;
  const path = after.request.path || before.request.path;

  if (severity === "unverified") {
    return `${method} ${path} - Execution unverified (${before.error?.message || "inconclusive probe"})`;
  }

  if (!before.error && after.error) {
    return `${method} ${path} - Endpoint execution failed in candidate (${after.error.message})`;
  }

  if (before.response && after.response && before.response.statusCode !== after.response.statusCode) {
    return `${method} ${path} - HTTP status changed from ${before.response.statusCode} to ${after.response.statusCode}`;
  }

  const removedDiff = differences.find(d => d.kind === "removed");
  if (removedDiff) {
    return `${method} ${path} - Response field '${removedDiff.path}' removed`;
  }

  const typeDiff = differences.find(d => d.kind === "type_changed");
  if (typeDiff) {
    return `${method} ${path} - Field '${typeDiff.path}' type changed`;
  }

  const headerDiff = differences.find(d => d.kind === "header_changed");
  if (headerDiff) {
    return `${method} ${path} - Header '${headerDiff.path}' changed`;
  }

  const valDiff = differences.find(d => d.kind === "changed");
  if (valDiff) {
    return `${method} ${path} - Value at '${valDiff.path}' changed`;
  }

  return `${method} ${path} - Behavioral delta detected (${severity})`;
}

function generateEvidence(
  before: Observation,
  after: Observation,
  differences: ValueDifference[],
  verdict: CompatibilityVerdict
): string[] {
  const evidence: string[] = [];

  evidence.push(`Probe ID: ${before.probeId}`);
  evidence.push(`Request: ${before.request.method} ${before.request.path}`);
  if (after.category) {
    evidence.push(`Category: ${after.category} (${after.intent || "general"})`);
  }
  if (after.motivatedBy) {
    evidence.push(`Contract Delta Reference: ${after.motivatedBy}`);
    evidence.push(`Verdict: ${verdict}`);
  }

  if (before.response) {
    evidence.push(`Baseline response: HTTP ${before.response.statusCode}`);
  } else if (before.error) {
    evidence.push(`Baseline error: ${before.error.message}`);
  }

  if (after.response) {
    evidence.push(`Candidate response: HTTP ${after.response.statusCode}`);
  } else if (after.error) {
    evidence.push(`Candidate error: ${after.error.message}`);
  }

  if (after.retryLog && after.retryLog.length > 0) {
    evidence.push(`Reliability: ${after.attempts || 1} attempt(s) made`);
    for (const log of after.retryLog) {
      evidence.push(`  Retry: ${log}`);
    }
  }

  for (const diff of differences) {
    if (diff.description) {
      evidence.push(diff.description);
    } else {
      evidence.push(`${diff.path} (${diff.kind}): ${JSON.stringify(diff.beforeValue)} -> ${JSON.stringify(diff.afterValue)}`);
    }
  }

  return evidence;
}
