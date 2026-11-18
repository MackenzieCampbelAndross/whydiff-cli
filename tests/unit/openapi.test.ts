import { describe, it, expect } from "vitest";
import {
  parseOpenApi,
  compareOpenApi,
  inspectOpenApi,
  OpenApiParseError,
  OpenApiSpec
} from "@whydiff/core";

describe("Unit: OpenAPI Contract Intelligence", () => {
  describe("Parser & Spec Loading", () => {
    it("parses valid OpenAPI 3.0 JSON specification", () => {
      const json = JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Pet Store", version: "1.0.0" },
        paths: {
          "/pets": {
            get: {
              summary: "List all pets",
              responses: { "200": { description: "Success" } }
            }
          }
        }
      });

      const spec = parseOpenApi(json, "test.json");
      expect(spec.openapi).toBe("3.0.3");
      expect(spec.info.title).toBe("Pet Store");
      expect(spec.paths["/pets"]?.get?.summary).toBe("List all pets");
    });

    it("parses valid OpenAPI 3.1 YAML specification", () => {
      const yaml = `
openapi: 3.1.0
info:
  title: YAML API
  version: 2.0.0
paths:
  /users:
    post:
      summary: Create user
      responses:
        "201":
          description: Created
`;
      const spec = parseOpenApi(yaml, "test.yaml");
      expect(spec.openapi).toBe("3.1.0");
      expect(spec.info.title).toBe("YAML API");
      expect(spec.paths["/users"]?.post?.summary).toBe("Create user");
    });

    it("resolves internal $ref references in schemas and parameters", () => {
      const json = JSON.stringify({
        openapi: "3.0.0",
        info: { title: "Ref API", version: "1.0.0" },
        paths: {
          "/items": {
            post: {
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/ItemInput"
                    }
                  }
                }
              },
              responses: { "200": { description: "ok" } }
            }
          }
        },
        components: {
          schemas: {
            ItemInput: {
              type: "object",
              required: ["sku"],
              properties: {
                sku: { type: "string" },
                price: { type: "number" }
              }
            }
          }
        }
      });

      const spec = parseOpenApi(json, "ref.json");
      const reqSchema = spec.paths["/items"]?.post?.requestBody?.content?.["application/json"]?.schema;
      expect(reqSchema).toBeDefined();
      expect(reqSchema?.type).toBe("object");
      expect(reqSchema?.required).toEqual(["sku"]);
      expect(reqSchema?.properties?.sku?.type).toBe("string");
    });

    it("throws OpenApiParseError for unsupported OpenAPI version", () => {
      const invalid = JSON.stringify({
        openapi: "2.0",
        info: { title: "Swagger API", version: "1.0.0" }
      });

      expect(() => parseOpenApi(invalid, "swagger.json")).toThrow(OpenApiParseError);
    });

    it("throws OpenApiParseError on malformed JSON / YAML syntax", () => {
      expect(() => parseOpenApi("invalid: { yaml: [unclosed", "bad.yaml")).toThrow(OpenApiParseError);
    });
  });

  describe("Contract Differ", () => {
    const baseSpec: OpenApiSpec = {
      openapi: "3.0.0",
      info: { title: "Base", version: "1.0.0" },
      paths: {
        "/v1/users": {
          get: {
            responses: {
              "200": {
                description: "List",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["id", "email"],
                      properties: {
                        id: { type: "string" },
                        email: { type: "string" }
                      }
                    }
                  }
                }
              }
            }
          },
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["name"],
                    properties: {
                      name: { type: "string" },
                      age: { type: "integer" }
                    }
                  }
                }
              }
            },
            responses: { "201": { description: "Created" } }
          }
        },
        "/v1/legacy": {
          delete: {
            responses: { "204": { description: "Deleted" } }
          }
        }
      }
    };

    it("detects removed endpoint as a breaking change", () => {
      const candSpec: OpenApiSpec = {
        openapi: "3.0.0",
        info: { title: "Cand", version: "1.1.0" },
        paths: {
          "/v1/users": baseSpec.paths["/v1/users"]!
        }
      };

      const diff = compareOpenApi(baseSpec, candSpec);
      expect(diff.breakingCount).toBeGreaterThanOrEqual(1);
      const endpointRemoved = diff.deltas.find(d => d.kind === "endpoint_removed");
      expect(endpointRemoved).toBeDefined();
      expect(endpointRemoved?.path).toBe("/v1/legacy");
      expect(endpointRemoved?.severity).toBe("breaking");
    });

    it("detects newly added endpoint as compatible change", () => {
      const candSpec: OpenApiSpec = {
        ...baseSpec,
        paths: {
          ...baseSpec.paths,
          "/v1/orders": {
            get: { responses: { "200": { description: "ok" } } }
          }
        }
      };

      const diff = compareOpenApi(baseSpec, candSpec);
      const added = diff.deltas.find(d => d.kind === "endpoint_added");
      expect(added).toBeDefined();
      expect(added?.path).toBe("/v1/orders");
      expect(added?.severity).toBe("changed");
    });

    it("detects newly required request body property as breaking change", () => {
      const candSpec: OpenApiSpec = JSON.parse(JSON.stringify(baseSpec));
      const postSchema = candSpec.paths["/v1/users"]!.post!.requestBody!.content!["application/json"]!.schema!;
      postSchema.required = ["name", "tenantId"];
      postSchema.properties!["tenantId"] = { type: "string" };

      const diff = compareOpenApi(baseSpec, candSpec);
      const reqAdded = diff.deltas.find(d => d.kind === "request_required_field_added");
      expect(reqAdded).toBeDefined();
      expect(reqAdded?.severity).toBe("breaking");
      expect(reqAdded?.description).toContain("tenantId");
    });

    it("detects removed response property as breaking change", () => {
      const candSpec: OpenApiSpec = JSON.parse(JSON.stringify(baseSpec));
      const getSchema = candSpec.paths["/v1/users"]!.get!.responses["200"]!.content!["application/json"]!.schema!;
      delete getSchema.properties!["email"];
      getSchema.required = ["id"];

      const diff = compareOpenApi(baseSpec, candSpec);
      const respRemoved = diff.deltas.find(d => d.kind === "response_field_removed");
      expect(respRemoved).toBeDefined();
      expect(respRemoved?.severity).toBe("breaking");
      expect(respRemoved?.description).toContain("email");
    });

    it("detects incompatible response property type change as breaking change", () => {
      const candSpec: OpenApiSpec = JSON.parse(JSON.stringify(baseSpec));
      const getSchema = candSpec.paths["/v1/users"]!.get!.responses["200"]!.content!["application/json"]!.schema!;
      getSchema.properties!["id"] = { type: "integer" }; // changed from string to integer

      const diff = compareOpenApi(baseSpec, candSpec);
      const typeChanged = diff.deltas.find(d => d.kind === "response_field_type_changed");
      expect(typeChanged).toBeDefined();
      expect(typeChanged?.severity).toBe("breaking");
      expect(typeChanged?.description).toContain("id");
    });

    it("detects authentication scheme requirement changes", () => {
      const candSpec: OpenApiSpec = JSON.parse(JSON.stringify(baseSpec));
      candSpec.paths["/v1/users"]!.get!.security = [{ ApiKeyAuth: [] }];

      const diff = compareOpenApi(baseSpec, candSpec);
      const authDiff = diff.deltas.find(d => d.kind === "auth_scheme_changed");
      expect(authDiff).toBeDefined();
      expect(authDiff?.severity).toBe("breaking");
    });
  });

  describe("Contract Inspector", () => {
    it("generates structured inspection summary from OpenAPI spec", () => {
      const spec: OpenApiSpec = {
        openapi: "3.0.3",
        info: { title: "Test Inspection", version: "3.2.1", description: "Inspection doc" },
        paths: {
          "/items": {
            get: {
              summary: "Get items",
              responses: { "200": { description: "ok" } }
            },
            post: {
              summary: "Add item",
              security: [{ Bearer: [] }],
              requestBody: {
                content: { "application/json": { schema: { type: "object" } } }
              },
              responses: { "201": { description: "created" } }
            }
          }
        },
        components: {
          securitySchemes: {
            Bearer: { type: "http", scheme: "bearer" }
          }
        }
      };

      const summary = inspectOpenApi(spec);
      expect(summary.title).toBe("Test Inspection");
      expect(summary.version).toBe("3.2.1");
      expect(summary.endpointCount).toBe(1);
      expect(summary.operationCount).toBe(2);
      expect(summary.securitySchemes).toContain("Bearer");

      const postOp = summary.operations.find(o => o.method === "POST");
      expect(postOp?.authRequired).toBe(true);
      expect(postOp?.hasRequestBody).toBe(true);
      expect(postOp?.responseCodes).toContain("201");
    });
  });
});
