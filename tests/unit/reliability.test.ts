import { describe, it, expect } from "vitest";
import {
  isIdempotentMethod,
  shouldRetryRequest,
  calculateBackoffDelay,
  normalizeObservation,
  RawObservation
} from "@whydiff/core";

describe("Unit: HTTP Reliability & Error Semantics", () => {
  describe("Idempotency Classification", () => {
    it("identifies GET, HEAD, PUT, DELETE, OPTIONS as idempotent", () => {
      expect(isIdempotentMethod("GET")).toBe(true);
      expect(isIdempotentMethod("get")).toBe(true);
      expect(isIdempotentMethod("HEAD")).toBe(true);
      expect(isIdempotentMethod("PUT")).toBe(true);
      expect(isIdempotentMethod("DELETE")).toBe(true);
      expect(isIdempotentMethod("OPTIONS")).toBe(true);
    });

    it("identifies POST and PATCH as non-idempotent", () => {
      expect(isIdempotentMethod("POST")).toBe(false);
      expect(isIdempotentMethod("post")).toBe(false);
      expect(isIdempotentMethod("PATCH")).toBe(false);
      expect(isIdempotentMethod("patch")).toBe(false);
    });
  });

  describe("Retry Safety Evaluation", () => {
    it("permits retry for idempotent methods on 502/503/504 errors", () => {
      expect(shouldRetryRequest("GET", 502, undefined, false)).toBe(true);
      expect(shouldRetryRequest("GET", 503, undefined, false)).toBe(true);
      expect(shouldRetryRequest("PUT", 504, undefined, false)).toBe(true);
    });

    it("protects non-idempotent methods (POST) from unsafe retries on transient errors", () => {
      expect(shouldRetryRequest("POST", 503, undefined, false)).toBe(false);
      expect(shouldRetryRequest("PATCH", 502, undefined, false)).toBe(false);
    });

    it("permits retry for non-idempotent methods when retryNonIdempotent flag is explicitly true", () => {
      expect(shouldRetryRequest("POST", 503, undefined, true)).toBe(true);
    });

    it("never retries 4xx client errors (e.g. 400, 404, 422)", () => {
      expect(shouldRetryRequest("GET", 400, undefined, false)).toBe(false);
      expect(shouldRetryRequest("GET", 404, undefined, false)).toBe(false);
      expect(shouldRetryRequest("GET", 422, undefined, false)).toBe(false);
    });

    it("permits retry on network connection or timeout errors for idempotent requests", () => {
      const connError = new Error("ECONNRESET");
      expect(shouldRetryRequest("GET", undefined, connError, false)).toBe(true);
      expect(shouldRetryRequest("POST", undefined, connError, false)).toBe(false);
    });
  });

  describe("Exponential Backoff Calculation", () => {
    it("calculates exponential delays with factor and ceiling", () => {
      expect(calculateBackoffDelay(1, 50, 2, 500)).toBe(50);
      expect(calculateBackoffDelay(2, 50, 2, 500)).toBe(100);
      expect(calculateBackoffDelay(3, 50, 2, 500)).toBe(200);
      expect(calculateBackoffDelay(4, 50, 2, 500)).toBe(400);
      // Capped by maxDelayMs (500)
      expect(calculateBackoffDelay(5, 50, 2, 500)).toBe(500);
    });
  });

  describe("Malformed JSON Response Handling", () => {
    it("handles non-JSON raw body without crashing in normalizer", () => {
      const raw: RawObservation = {
        probeId: "probe-html",
        revision: "cand",
        timestamp: "2026-11-18T10:00:00Z",
        durationMs: 45,
        request: { method: "GET", path: "/error-page" },
        response: {
          statusCode: 502,
          headers: { "content-type": "text/html" },
          rawBody: "<html><body>502 Bad Gateway</body></html>"
        }
      };

      const normalized = normalizeObservation(raw);
      expect(normalized.response).toBeDefined();
      expect(normalized.response?.statusCode).toBe(502);
      expect(normalized.response?.body).toBe("<html><body>502 Bad Gateway</body></html>");
    });
  });
});
