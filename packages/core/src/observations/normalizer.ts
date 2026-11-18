import { NormalizationOptions, Observation, ObservationResponse } from "./types.js";

const DEFAULT_SENSITIVE_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
  "x-auth-token",
  "token"
]);

export function canonicalizeJson(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }

  // Value is an object
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const canonicalObj: Record<string, unknown> = {};

  for (const key of sortedKeys) {
    const val = obj[key];
    canonicalObj[key] = canonicalizeJson(val);
  }

  return canonicalObj;
}

export function normalizeHeaders(
  rawHeaders: Record<string, string | string[] | number | undefined>,
  options: NormalizationOptions = {}
): Record<string, string> {
  const result: Record<string, string> = {};
  const includeSet = options.includeHeaders && options.includeHeaders.length > 0
    ? new Set(options.includeHeaders.map(h => h.toLowerCase()))
    : null;

  const ignoreSet = new Set(
    (options.ignoreHeaders ?? []).map(h => h.toLowerCase())
  );

  const redact = options.redactSensitive !== false;

  for (const [key, value] of Object.entries(rawHeaders)) {
    if (value === undefined || value === null) continue;

    const lowerKey = key.toLowerCase();

    // Check include filter
    if (includeSet && !includeSet.has(lowerKey)) {
      continue;
    }

    // Check ignore filter
    if (ignoreSet.has(lowerKey)) {
      continue;
    }

    // Redact sensitive headers
    if (redact && DEFAULT_SENSITIVE_HEADERS.has(lowerKey)) {
      result[lowerKey] = "[REDACTED]";
      continue;
    }

    const strVal = Array.isArray(value) ? value.join(", ") : String(value);
    result[lowerKey] = strVal;
  }

  // Return deterministically sorted headers
  const sortedResult: Record<string, string> = {};
  for (const k of Object.keys(result).sort()) {
    const v = result[k];
    if (v !== undefined) {
      sortedResult[k] = v;
    }
  }

  return sortedResult;
}

export function normalizeObservation(
  observation: Observation,
  options: NormalizationOptions = {}
): Observation {
  let normalizedResponse: ObservationResponse | undefined;

  if (observation.response) {
    let normalizedBody = observation.response.body;
    if (typeof normalizedBody === "string") {
      try {
        const parsed = JSON.parse(normalizedBody);
        normalizedBody = canonicalizeJson(parsed);
      } catch {
        // Raw string, preserve as is
      }
    } else {
      normalizedBody = canonicalizeJson(normalizedBody);
    }

    normalizedResponse = {
      statusCode: observation.response.statusCode,
      headers: normalizeHeaders(observation.response.headers, options),
      body: normalizedBody
    };
  }

  return {
    probeId: observation.probeId,
    revision: observation.revision,
    timestamp: observation.timestamp,
    request: {
      method: observation.request.method,
      path: observation.request.path,
      query: observation.request.query ? (canonicalizeJson(observation.request.query) as Record<string, string>) : undefined,
      headers: observation.request.headers ? normalizeHeaders(observation.request.headers, options) : undefined,
      payload: canonicalizeJson(observation.request.payload)
    },
    response: normalizedResponse,
    durationMs: observation.durationMs,
    error: observation.error ? { ...observation.error } : undefined
  };
}
