import { describe, it, expect } from "vitest";
import { canonicalizeJson, normalizeHeaders, normalizeObservation } from "@whydiff/core";

describe("Unit: Observation Normalization", () => {
  it("canonicalizes object key ordering recursively", () => {
    const raw = {
      z: 1,
      b: 2,
      a: {
        y: "hello",
        x: "world",
        m: [ { c: 3, b: 2, a: 1 } ]
      }
    };

    const canonical = canonicalizeJson(raw);
    const serialized = JSON.stringify(canonical);
    expect(serialized).toBe('{"a":{"m":[{"a":1,"b":2,"c":3}],"x":"world","y":"hello"},"b":2,"z":1}');
  });

  it("preserves array ordering strictly", () => {
    const arr = [3, 1, 2, "c", "a", "b"];
    const canonical = canonicalizeJson(arr);
    expect(canonical).toEqual([3, 1, 2, "c", "a", "b"]);
  });

  it("preserves null vs undefined distinctions", () => {
    expect(canonicalizeJson(null)).toBeNull();
    expect(canonicalizeJson(undefined)).toBeUndefined();
    expect(canonicalizeJson({ a: null, b: undefined })).toEqual({ a: null, b: undefined });
  });

  it("normalizes headers: converts to lowercase, applies ignore and redact", () => {
    const headers = {
      "Content-Type": "application/json",
      "Date": "Wed, 18 Nov 2026 12:00:00 GMT",
      "X-Request-Id": "req_12345",
      "Authorization": "Bearer secret_token_xyz",
      "X-Custom-Header": "value"
    };

    const normalized = normalizeHeaders(headers, {
      ignoreHeaders: ["date", "x-request-id"],
      redactSensitive: true
    });

    expect(normalized).toEqual({
      "authorization": "[REDACTED]",
      "content-type": "application/json",
      "x-custom-header": "value"
    });
    expect(normalized["date"]).toBeUndefined();
    expect(normalized["x-request-id"]).toBeUndefined();
  });

  it("applies includeHeaders filter when specified", () => {
    const headers = {
      "content-type": "application/json",
      "cache-control": "max-age=3600",
      "server": "fastify"
    };

    const normalized = normalizeHeaders(headers, {
      includeHeaders: ["content-type"]
    });

    expect(normalized).toEqual({
      "content-type": "application/json"
    });
  });

  it("normalizes full observation structure including parsed JSON body", () => {
    const obs = {
      probeId: "user-probe",
      revision: "rev-a",
      timestamp: "2026-11-18T10:00:00Z",
      request: {
        method: "GET",
        path: "/users/1"
      },
      response: {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Date": "today"
        },
        body: '{"name":"Alice","id":1}'
      }
    };

    const normalized = normalizeObservation(obs, { ignoreHeaders: ["date"] });
    expect(normalized.response?.statusCode).toBe(200);
    expect(normalized.response?.headers).toEqual({ "content-type": "application/json" });
    expect(normalized.response?.body).toEqual({ id: 1, name: "Alice" });
  });
});
