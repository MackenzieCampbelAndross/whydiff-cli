import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  loadOpenApi,
  compareOpenApi,
  generateDifferentialProbes
} from "@whydiff/core";

describe("Integration: OpenAPI Contract Comparison & Differential Probing", () => {
  const currentDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const demoRoot = path.resolve(currentDir, "../../examples/fastify-regression-demo");
  const baselinePath = path.join(demoRoot, "openapi-baseline.json");
  const candidatePath = path.join(demoRoot, "openapi-candidate.yaml");

  it("loads and compares baseline (JSON 3.0) and candidate (YAML 3.1) contracts", async () => {
    const baseSpec = await loadOpenApi(baselinePath);
    const candSpec = await loadOpenApi(candidatePath);

    expect(baseSpec.openapi).toBe("3.0.3");
    expect(candSpec.openapi).toBe("3.1.0");

    const diff = compareOpenApi(baseSpec, candSpec);

    expect(diff.baselineTitle).toBe("Fastify Regression Demo API");
    expect(diff.candidateTitle).toBe("Fastify Regression Demo API");
    expect(diff.breakingCount).toBeGreaterThanOrEqual(3);
    expect(diff.changedCount).toBeGreaterThanOrEqual(1);

    // 1. Verify removed endpoint
    const endpointRemoved = diff.deltas.find(d => d.kind === "endpoint_removed");
    expect(endpointRemoved).toBeDefined();
    expect(endpointRemoved?.path).toBe("/legacy-endpoint");
    expect(endpointRemoved?.severity).toBe("breaking");

    // 2. Verify removed response field (email from UserProfile)
    const respRemoved = diff.deltas.find(d => d.kind === "response_field_removed");
    expect(respRemoved).toBeDefined();
    expect(respRemoved?.path).toBe("/users/{id}");
    expect(respRemoved?.description).toContain("email");

    // 3. Verify newly required request body field (customerId on /orders)
    const reqFieldAdded = diff.deltas.find(d => d.kind === "request_required_field_added");
    expect(reqFieldAdded).toBeDefined();
    expect(reqFieldAdded?.path).toBe("/orders");
    expect(reqFieldAdded?.description).toContain("customerId");

    // 4. Verify auth scheme change on /secure/profile
    const authChanged = diff.deltas.find(d => d.kind === "auth_scheme_changed");
    expect(authChanged).toBeDefined();
    expect(authChanged?.path).toBe("/secure/profile");
  });

  it("generates targeted differential probes motivated by contract deltas", async () => {
    const baseSpec = await loadOpenApi(baselinePath);
    const candSpec = await loadOpenApi(candidatePath);
    const diff = compareOpenApi(baseSpec, candSpec);

    const diffProbes = generateDifferentialProbes(diff, baseSpec, candSpec);

    expect(diffProbes.length).toBeGreaterThan(0);
    for (const p of diffProbes) {
      expect(p.motivatedBy).toBeDefined();
      expect(p.tags).toContain("differential");
    }

    // Must have a probe targeting the orders customerId change
    const orderProbe = diffProbes.find(p => p.path === "/orders");
    expect(orderProbe).toBeDefined();
  });
});
