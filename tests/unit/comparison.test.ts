import { describe, it, expect } from "vitest";
import { compareObservations, Observation } from "@whydiff/core";

function makeObs(overrides: Partial<Observation> = {}): Observation {
  return {
    probeId: "test-probe",
    revision: "main",
    timestamp: "2026-11-18T10:00:00Z",
    request: { method: "GET", path: "/test" },
    response: {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: { status: "ok" }
    },
    ...overrides
  };
}

describe("Unit: Observation Comparison Engine", () => {
  it("detects no differences between identical observations", () => {
    const before = makeObs();
    const after = makeObs({ revision: "HEAD" });

    const result = compareObservations(before, after);
    expect(result.hasDifferences).toBe(false);
    expect(result.differences).toHaveLength(0);
  });

  it("detects HTTP status change", () => {
    const before = makeObs();
    const after = makeObs({
      revision: "HEAD",
      response: {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: { status: "ok" }
      }
    });

    const result = compareObservations(before, after);
    expect(result.hasDifferences).toBe(true);
    const statusDiff = result.differences.find(d => d.kind === "status_changed");
    expect(statusDiff).toBeDefined();
    expect(statusDiff?.beforeValue).toBe(200);
    expect(statusDiff?.afterValue).toBe(500);
  });

  it("detects removed response body fields", () => {
    const before = makeObs({
      response: {
        statusCode: 200,
        headers: {},
        body: { id: "123", email: "user@example.com", name: "Alice" }
      }
    });
    const after = makeObs({
      revision: "HEAD",
      response: {
        statusCode: 200,
        headers: {},
        body: { id: "123", name: "Alice" }
      }
    });

    const result = compareObservations(before, after);
    expect(result.hasDifferences).toBe(true);
    const removed = result.differences.find(d => d.kind === "removed");
    expect(removed).toBeDefined();
    expect(removed?.path).toBe("body.email");
    expect(removed?.beforeValue).toBe("user@example.com");
  });

  it("detects added response body fields", () => {
    const before = makeObs({
      response: {
        statusCode: 200,
        headers: {},
        body: { id: "123" }
      }
    });
    const after = makeObs({
      revision: "HEAD",
      response: {
        statusCode: 200,
        headers: {},
        body: { id: "123", isNew: true }
      }
    });

    const result = compareObservations(before, after);
    expect(result.hasDifferences).toBe(true);
    const added = result.differences.find(d => d.kind === "added");
    expect(added).toBeDefined();
    expect(added?.path).toBe("body.isNew");
    expect(added?.afterValue).toBe(true);
  });

  it("detects type changes", () => {
    const before = makeObs({
      response: {
        statusCode: 200,
        headers: {},
        body: { count: 42 }
      }
    });
    const after = makeObs({
      revision: "HEAD",
      response: {
        statusCode: 200,
        headers: {},
        body: { count: "42" }
      }
    });

    const result = compareObservations(before, after);
    expect(result.hasDifferences).toBe(true);
    const typeDiff = result.differences.find(d => d.kind === "type_changed");
    expect(typeDiff).toBeDefined();
    expect(typeDiff?.path).toBe("body.count");
    expect(typeDiff?.beforeValue).toBe(42);
    expect(typeDiff?.afterValue).toBe("42");
  });

  it("detects header changes", () => {
    const before = makeObs({
      response: {
        statusCode: 200,
        headers: { "cache-control": "public, max-age=3600" },
        body: {}
      }
    });
    const after = makeObs({
      revision: "HEAD",
      response: {
        statusCode: 200,
        headers: { "cache-control": "no-store" },
        body: {}
      }
    });

    const result = compareObservations(before, after);
    expect(result.hasDifferences).toBe(true);
    const headerDiff = result.differences.find(d => d.kind === "header_changed");
    expect(headerDiff).toBeDefined();
    expect(headerDiff?.path).toBe("headers.cache-control");
  });

  it("detects execution errors between revisions", () => {
    const before = makeObs();
    const after = makeObs({
      revision: "HEAD",
      response: undefined,
      error: {
        name: "TimeoutError",
        message: "Probe timed out"
      }
    });

    const result = compareObservations(before, after);
    expect(result.hasDifferences).toBe(true);
    const errDiff = result.differences.find(d => d.kind === "execution_failed");
    expect(errDiff).toBeDefined();
  });
});
