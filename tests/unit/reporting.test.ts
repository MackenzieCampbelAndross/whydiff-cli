import { describe, it, expect } from "vitest";
import { formatBanner, formatDiffReport, formatExplainDelta, RunReport } from "@whydiff/core";

function makeSampleReport(): RunReport {
  return {
    metadata: {
      runId: "run_test_123",
      version: "0.1.0",
      nodeVersion: "v22.21.1",
      timestamp: "2026-11-18T12:00:00Z",
      durationMs: 450,
      project: { name: "test-svc", framework: "fastify" },
      baseline: { ref: "main", sha: "1111111111111111111111111111111111111111" },
      candidate: { ref: "HEAD", sha: "2222222222222222222222222222222222222222" },
      statistics: {
        probeCount: 1,
        successfulProbes: 1,
        failedProbes: 0,
        deltaCount: 1,
        breakingCount: 1,
        riskyCount: 0,
        changedCount: 0,
        informationalCount: 0
      }
    },
    deltas: [
      {
        id: "bd_001",
        title: "GET /users/1 - Response field 'body.email' removed",
        severity: "breaking",
        confidence: 1.0,
        surface: ["http"],
        before: {
          probeId: "p1",
          revision: "main",
          timestamp: "2026-11-18T12:00:00Z",
          request: { method: "GET", path: "/users/1" },
          response: { statusCode: 200, headers: {}, body: { email: "a@b.com" } }
        },
        after: {
          probeId: "p1",
          revision: "HEAD",
          timestamp: "2026-11-18T12:00:01Z",
          request: { method: "GET", path: "/users/1" },
          response: { statusCode: 200, headers: {}, body: {} }
        },
        differences: [
          { path: "body.email", kind: "removed", beforeValue: "a@b.com" }
        ],
        evidence: ["Field 'body.email' removed"],
        affectedCode: [],
        createdAt: "2026-11-18T12:00:02Z"
      }
    ],
    baselineObservations: [],
    candidateObservations: []
  };
}

describe("Unit: Reporting Formatting Engine", () => {
  it("formats ASCII banner with WHYDIFF version", () => {
    const banner = formatBanner();
    expect(banner).toContain("WHYDIFF v0.1.0");
    expect(banner).toContain("Behavioral Change Detection & Verification");
  });

  it("formats terminal diff report with visual hierarchy", () => {
    const report = makeSampleReport();
    const formatted = formatDiffReport(report);

    expect(formatted).toContain("BASELINE       main");
    expect(formatted).toContain("CANDIDATE      HEAD");
    expect(formatted).toContain("Breaking               1");
    expect(formatted).toContain("[BREAKING] bd_001");
    expect(formatted).toContain("GET /users/1");
    expect(formatted).toContain("Response field removed:");
    expect(formatted).toContain("1 behavioral delta(s) detected.");
  });

  it("formats explain delta view with evidence and limitations", () => {
    const report = makeSampleReport();
    const explained = formatExplainDelta(report.deltas[0]!, report.metadata.runId);

    expect(explained).toContain("EXPLANATION FOR DELTA: bd_001");
    expect(explained).toContain("Severity:     BREAKING");
    expect(explained).toContain("Confidence:   100%");
    expect(explained).toContain("Observed Impact:");
    expect(explained).toContain("Limitations:");
    expect(explained).toContain(".whydiff/reports/run_test_123/report.json");
  });
});
