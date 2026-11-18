import { Observation } from "../observations/types.js";
import { ValueDifference } from "../comparison/types.js";
import { BehavioralDelta, DeltaSeverity } from "./types.js";

export function classifyDelta(
  index: number,
  before: Observation,
  after: Observation,
  differences: ValueDifference[]
): BehavioralDelta {
  const id = `bd_${String(index + 1).padStart(3, "0")}`;
  const severity = determineSeverity(before, after, differences);
  const title = generateTitle(before, after, differences, severity);
  const evidence = generateEvidence(before, after, differences);

  return {
    id,
    title,
    severity,
    confidence: 1.0, // Observed deterministic execution
    surface: ["http"],
    before,
    after,
    differences,
    evidence,
    affectedCode: [], // Source attribution not implemented in Phase 0
    createdAt: new Date().toISOString()
  };
}

function determineSeverity(
  before: Observation,
  after: Observation,
  differences: ValueDifference[]
): DeltaSeverity {
  // Check execution failure in candidate
  if (!before.error && after.error) {
    return "breaking";
  }

  const beforeStatus = before.response?.statusCode;
  const afterStatus = after.response?.statusCode;

  // Endpoint was 2xx, now is 4xx or 5xx
  if (beforeStatus !== undefined && afterStatus !== undefined) {
    if (beforeStatus >= 200 && beforeStatus < 300 && afterStatus >= 400) {
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
    // If response was successful (2xx), removing fields is breaking
    if (beforeStatus && beforeStatus >= 200 && beforeStatus < 300) {
      return "breaking";
    }
    return "risky";
  }

  if (hasStatusChange) {
    // Status changed within 2xx range (e.g. 200 -> 201) or other changes
    return "risky";
  }

  if (hasValueChange || hasHeaderChange || hasAddition) {
    return "changed";
  }

  return "informational";
}

function generateTitle(
  before: Observation,
  after: Observation,
  differences: ValueDifference[],
  severity: DeltaSeverity
): string {
  const method = after.request.method || before.request.method;
  const path = after.request.path || before.request.path;

  if (!before.error && after.error) {
    return `${method} ${path} - Endpoint execution failed in candidate`;
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
  differences: ValueDifference[]
): string[] {
  const evidence: string[] = [];

  evidence.push(`Probe ID: ${before.probeId}`);
  evidence.push(`Request: ${before.request.method} ${before.request.path}`);

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

  for (const diff of differences) {
    if (diff.description) {
      evidence.push(diff.description);
    } else {
      evidence.push(`${diff.path} (${diff.kind}): ${JSON.stringify(diff.beforeValue)} -> ${JSON.stringify(diff.afterValue)}`);
    }
  }

  return evidence;
}
