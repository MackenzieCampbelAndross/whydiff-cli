import { describe, it, expect } from "vitest";
import {
  generateProbesFromSpec,
  sampleValidSchema,
  sampleInvalidValueForType,
  OpenApiSpec
} from "@whydiff/core";

describe("Unit: Schema-Aware Probe Generation", () => {
  const sampleSpec: OpenApiSpec = {
    openapi: "3.0.3",
    info: { title: "Generator Test", version: "1.0.0" },
    paths: {
      "/products/{id}": {
        get: {
          summary: "Get product",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" }
            },
            {
              name: "includeDetails",
              in: "query",
              required: false,
              schema: { type: "boolean" }
            }
          ],
          responses: { "200": { description: "Success" } }
        },
        put: {
          summary: "Update product",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" }
            }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "price", "category"],
                  properties: {
                    name: { type: "string", minLength: 3, maxLength: 50 },
                    price: { type: "number", minimum: 0 },
                    category: { type: "string", enum: ["electronics", "clothing", "books"] },
                    tags: { type: "array", items: { type: "string" } }
                  }
                }
              }
            }
          },
          responses: { "200": { description: "Updated" } }
        }
      }
    }
  };

  it("generates deterministic probes with stable identifiers", () => {
    const probes1 = generateProbesFromSpec(sampleSpec);
    const probes2 = generateProbesFromSpec(sampleSpec);

    expect(probes1.length).toBeGreaterThan(0);
    expect(probes1.map(p => p.id)).toEqual(probes2.map(p => p.id));
    for (const p of probes1) {
      expect(p.id).toMatch(/^gen_/);
      expect(p.sourcePath).toBe("/products/{id}");
    }
  });

  it("resolves path parameters with sampled values in probe path", () => {
    const probes = generateProbesFromSpec(sampleSpec);
    const getProbe = probes.find(p => p.method === "GET");

    expect(getProbe).toBeDefined();
    expect(getProbe?.path).not.toContain("{id}");
    expect(getProbe?.path).toMatch(/^\/products\/.+/);
  });

  it("generates valid happy-path payload adhering to required fields and types", () => {
    const probes = generateProbesFromSpec(sampleSpec, { validOnly: true });
    const putProbe = probes.find(p => p.method === "PUT");

    expect(putProbe).toBeDefined();
    expect(putProbe?.category).toBe("valid");
    expect(putProbe?.payload).toBeDefined();

    const payload = putProbe?.payload as Record<string, unknown>;
    expect(typeof payload.name).toBe("string");
    expect(typeof payload.price).toBe("number");
    expect(["electronics", "clothing", "books"]).toContain(payload.category);
  });

  it("generates negative probes testing missing required fields", () => {
    const probes = generateProbesFromSpec(sampleSpec, { includeInvalid: true });
    const missingFieldProbes = probes.filter(p => p.tags?.includes("missing-field"));

    expect(missingFieldProbes.length).toBeGreaterThan(0);
    for (const p of missingFieldProbes) {
      expect(p.category).toBe("invalid");
      expect(p.intent).toBe("validation_error");
      expect(p.payload).toBeDefined();
      // One of the required fields must be omitted
      const payload = p.payload as Record<string, unknown>;
      const hasMissingField = !payload.name || payload.price === undefined || !payload.category;
      expect(hasMissingField).toBe(true);
    }
  });

  it("generates negative probes testing invalid property types", () => {
    const probes = generateProbesFromSpec(sampleSpec, { includeInvalid: true });
    const invalidTypeProbes = probes.filter(p => p.tags?.includes("bad-type") || p.tags?.includes("invalid-schema"));

    expect(invalidTypeProbes.length).toBeGreaterThan(0);
    for (const p of invalidTypeProbes) {
      expect(p.category).toBe("invalid");
      expect(p.intent).toBe("validation_error");
    }
  });

  it("respects maxProbesPerEndpoint limit", () => {
    const probes = generateProbesFromSpec(sampleSpec, { maxProbesPerEndpoint: 2 });
    const putProbes = probes.filter(p => p.method === "PUT");

    expect(putProbes.length).toBeLessThanOrEqual(2);
  });

  describe("Schema Sampler", () => {
    it("samples string with format and boundaries", () => {
      const email = sampleValidSchema({ type: "string", format: "email" });
      expect(typeof email).toBe("string");
      expect(email).toContain("@");

      const uuid = sampleValidSchema({ type: "string", format: "uuid" });
      expect(uuid).toBe("123e4567-e89b-12d3-a456-426614174000");
    });

    it("samples enum values respecting choices", () => {
      const val = sampleValidSchema({ type: "string", enum: ["red", "green", "blue"] });
      expect(val).toBe("red");
    });

    it("samples number respecting minimum and maximum", () => {
      const num = sampleValidSchema({ type: "number", minimum: 10, maximum: 50 });
      expect(typeof num).toBe("number");
      expect(num).toBeGreaterThanOrEqual(10);
      expect(num).toBeLessThanOrEqual(50);
    });

    it("samples invalid values violating target type", () => {
      const invalidString = sampleInvalidValueForType("string");
      expect(typeof invalidString).not.toBe("string");

      const invalidNumber = sampleInvalidValueForType("number");
      expect(typeof invalidNumber).not.toBe("number");

      const invalidBoolean = sampleInvalidValueForType("boolean");
      expect(typeof invalidBoolean).not.toBe("boolean");
    });
  });
});
