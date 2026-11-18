import { describe, it, expect } from "vitest";
import { classifyDelta, Observation, ValueDifference } from "@whydiff/core";

function makeObs(statusCode = 200): Observation {
  return {
    probeId: "p1",
    revision: "v1",
    timestamp: "2026-11-18T10:00:00Z",
    request: { method: "GET", path: "/items" },
    response: { statusCode, headers: {}, body: {} }
  };
}

describe("Unit: Severity Classification Engine", () => {
  it("classifies candidate execution failure as breaking", () => {
    const before = makeObs(200);
    const after = {
      ...makeObs(200),
      response: undefined,
      error: { name: "Error", message: "Failed" }
    };
    const diffs: ValueDifference[] = [
      { path: "error", kind: "execution_failed", beforeValue: undefined, afterValue: "Failed" }
    ];

    const delta = classifyDelta(0, before, after, diffs);
    expect(delta.id).toBe("bd_001");
    expect(delta.severity).toBe("breaking");
    expect(delta.confidence).toBe(1.0);
  });

  it("classifies 200 -> 500 status change as breaking", () => {
    const before = makeObs(200);
    const after = makeObs(500);
    const diffs: ValueDifference[] = [
      { path: "statusCode", kind: "status_changed", beforeValue: 200, afterValue: 500 }
    ];

    const delta = classifyDelta(1, before, after, diffs);
    expect(delta.id).toBe("bd_002");
    expect(delta.severity).toBe("breaking");
  });

  it("classifies response field removal from successful response as breaking", () => {
    const before = makeObs(200);
    const after = makeObs(200);
    const diffs: ValueDifference[] = [
      { path: "body.email", kind: "removed", beforeValue: "a@b.com" }
    ];

    const delta = classifyDelta(2, before, after, diffs);
    expect(delta.severity).toBe("breaking");
  });

  it("classifies field type change as breaking", () => {
    const before = makeObs(200);
    const after = makeObs(200);
    const diffs: ValueDifference[] = [
      { path: "body.count", kind: "type_changed", beforeValue: 42, afterValue: "42" }
    ];

    const delta = classifyDelta(0, before, after, diffs);
    expect(delta.severity).toBe("breaking");
  });

  it("classifies status change within 2xx range (201 -> 200) as risky", () => {
    const before = makeObs(201);
    const after = makeObs(200);
    const diffs: ValueDifference[] = [
      { path: "statusCode", kind: "status_changed", beforeValue: 201, afterValue: 200 }
    ];

    const delta = classifyDelta(0, before, after, diffs);
    expect(delta.severity).toBe("risky");
  });

  it("classifies value changes as changed", () => {
    const before = makeObs(200);
    const after = makeObs(200);
    const diffs: ValueDifference[] = [
      { path: "body.mode", kind: "changed", beforeValue: "standard", afterValue: "legacy" }
    ];

    const delta = classifyDelta(0, before, after, diffs);
    expect(delta.severity).toBe("changed");
  });

  it("classifies header changes as changed", () => {
    const before = makeObs(200);
    const after = makeObs(200);
    const diffs: ValueDifference[] = [
      { path: "headers.cache-control", kind: "header_changed", beforeValue: "a", afterValue: "b" }
    ];

    const delta = classifyDelta(0, before, after, diffs);
    expect(delta.severity).toBe("changed");
  });
});
