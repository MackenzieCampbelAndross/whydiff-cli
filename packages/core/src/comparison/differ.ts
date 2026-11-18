import { Observation } from "../observations/types.js";
import { ComparisonResult, DifferenceKind, ValueDifference } from "./types.js";

export function compareObservations(before: Observation, after: Observation): ComparisonResult {
  const differences: ValueDifference[] = [];

  // 1. Check for execution errors
  if (before.error && !after.error) {
    differences.push({
      path: "error",
      kind: "execution_failed",
      beforeValue: before.error.message,
      afterValue: undefined,
      description: `Baseline failed with error '${before.error.message}', but candidate succeeded`
    });
  } else if (!before.error && after.error) {
    differences.push({
      path: "error",
      kind: "execution_failed",
      beforeValue: undefined,
      afterValue: after.error.message,
      description: `Candidate failed with error '${after.error.message}', but baseline succeeded`
    });
  } else if (before.error && after.error) {
    if (before.error.name !== after.error.name || before.error.message !== after.error.message) {
      differences.push({
        path: "error",
        kind: "changed",
        beforeValue: `${before.error.name}: ${before.error.message}`,
        afterValue: `${after.error.name}: ${after.error.message}`,
        description: `Error changed from '${before.error.message}' to '${after.error.message}'`
      });
    }
  }

  // If one or both had no response due to an error, we can finish or continue
  if (!before.response && after.response) {
    differences.push({
      path: "response",
      kind: "added",
      beforeValue: undefined,
      afterValue: `${after.response.statusCode}`,
      description: "Baseline had no response; candidate returned a response"
    });
    return buildResult(before.probeId, differences);
  }

  if (before.response && !after.response) {
    differences.push({
      path: "response",
      kind: "removed",
      beforeValue: `${before.response.statusCode}`,
      afterValue: undefined,
      description: "Baseline returned a response; candidate had no response"
    });
    return buildResult(before.probeId, differences);
  }

  if (!before.response && !after.response) {
    return buildResult(before.probeId, differences);
  }

  const beforeRes = before.response!;
  const afterRes = after.response!;

  // 2. Status code comparison
  if (beforeRes.statusCode !== afterRes.statusCode) {
    differences.push({
      path: "statusCode",
      kind: "status_changed",
      beforeValue: beforeRes.statusCode,
      afterValue: afterRes.statusCode,
      description: `HTTP status code changed from ${beforeRes.statusCode} to ${afterRes.statusCode}`
    });
  }

  // 3. Headers comparison
  compareHeaders(beforeRes.headers, afterRes.headers, differences);

  // 4. Response body comparison
  compareValues("body", beforeRes.body, afterRes.body, differences);

  return buildResult(before.probeId, differences);
}

function compareHeaders(
  beforeHeaders: Record<string, string>,
  afterHeaders: Record<string, string>,
  differences: ValueDifference[]
): void {
  const allKeys = new Set([...Object.keys(beforeHeaders), ...Object.keys(afterHeaders)]);
  const sortedKeys = Array.from(allKeys).sort();

  for (const key of sortedKeys) {
    const beforeVal = beforeHeaders[key];
    const afterVal = afterHeaders[key];

    if (beforeVal !== undefined && afterVal === undefined) {
      differences.push({
        path: `headers.${key}`,
        kind: "header_changed",
        beforeValue: beforeVal,
        afterValue: undefined,
        description: `Header '${key}' removed (was '${beforeVal}')`
      });
    } else if (beforeVal === undefined && afterVal !== undefined) {
      differences.push({
        path: `headers.${key}`,
        kind: "header_changed",
        beforeValue: undefined,
        afterValue: afterVal,
        description: `Header '${key}' added (now '${afterVal}')`
      });
    } else if (beforeVal !== afterVal) {
      differences.push({
        path: `headers.${key}`,
        kind: "header_changed",
        beforeValue: beforeVal,
        afterValue: afterVal,
        description: `Header '${key}' changed from '${beforeVal}' to '${afterVal}'`
      });
    }
  }
}

function compareValues(
  currentPath: string,
  beforeVal: unknown,
  afterVal: unknown,
  differences: ValueDifference[]
): void {
  // Check existence
  if (beforeVal !== undefined && afterVal === undefined) {
    differences.push({
      path: currentPath,
      kind: "removed",
      beforeValue: beforeVal,
      afterValue: undefined,
      description: `Field '${currentPath}' removed`
    });
    return;
  }

  if (beforeVal === undefined && afterVal !== undefined) {
    differences.push({
      path: currentPath,
      kind: "added",
      beforeValue: undefined,
      afterValue: afterVal,
      description: `Field '${currentPath}' added`
    });
    return;
  }

  // Check types
  const beforeType = getDetailedType(beforeVal);
  const afterType = getDetailedType(afterVal);

  if (beforeType !== afterType) {
    differences.push({
      path: currentPath,
      kind: "type_changed",
      beforeValue: beforeVal,
      afterValue: afterVal,
      description: `Type of '${currentPath}' changed from ${beforeType} to ${afterType}`
    });
    return;
  }

  // Primitive equality
  if (beforeType !== "object" && beforeType !== "array") {
    if (beforeVal !== afterVal) {
      differences.push({
        path: currentPath,
        kind: "changed",
        beforeValue: beforeVal,
        afterValue: afterVal,
        description: `Value of '${currentPath}' changed from ${JSON.stringify(beforeVal)} to ${JSON.stringify(afterVal)}`
      });
    }
    return;
  }

  // Arrays
  if (beforeType === "array") {
    const beforeArr = beforeVal as unknown[];
    const afterArr = afterVal as unknown[];
    const maxLen = Math.max(beforeArr.length, afterArr.length);

    for (let i = 0; i < maxLen; i++) {
      const elemPath = `${currentPath}[${i}]`;
      const bItem = beforeArr[i];
      const aItem = afterArr[i];
      compareValues(elemPath, bItem, aItem, differences);
    }
    return;
  }

  // Objects
  const beforeObj = beforeVal as Record<string, unknown>;
  const afterObj = afterVal as Record<string, unknown>;
  const keys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
  const sortedKeys = Array.from(keys).sort();

  for (const key of sortedKeys) {
    const childPath = `${currentPath}.${key}`;
    const bChild = beforeObj[key];
    const aChild = afterObj[key];
    compareValues(childPath, bChild, aChild, differences);
  }
}

function getDetailedType(val: unknown): string {
  if (val === null) return "null";
  if (val === undefined) return "undefined";
  if (Array.isArray(val)) return "array";
  return typeof val;
}

function buildResult(probeId: string, differences: ValueDifference[]): ComparisonResult {
  const hasDifferences = differences.length > 0;
  return {
    probeId,
    hasDifferences,
    differences,
    summary: hasDifferences
      ? `${differences.length} differences detected`
      : "No observable differences"
  };
}
