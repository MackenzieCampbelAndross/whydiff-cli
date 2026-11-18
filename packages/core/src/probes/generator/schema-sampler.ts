import { OpenApiSchema } from "../../openapi/types.js";

export function sampleValidSchema(schema?: OpenApiSchema, depth = 0, maxDepth = 5): unknown {
  if (!schema || depth > maxDepth) {
    return "test-val";
  }

  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;

  if (schema.enum && schema.enum.length > 0) {
    return schema.enum[0];
  }

  const rawType = schema.type;
  const type = Array.isArray(rawType) ? rawType[0] : rawType;

  switch (type) {
    case "string":
      if (schema.format === "email") return "user@example.com";
      if (schema.format === "uuid") return "123e4567-e89b-12d3-a456-426614174000";
      if (schema.format === "date" || schema.format === "date-time") return "2026-01-01T00:00:00.000Z";
      if (schema.format === "uri") return "https://example.com/api";
      return "example-string";

    case "integer":
    case "number":
      if (schema.minimum !== undefined) return schema.minimum;
      if (schema.maximum !== undefined) return Math.min(100, schema.maximum);
      return 42;

    case "boolean":
      return true;

    case "array":
      if (schema.items) {
        return [sampleValidSchema(schema.items, depth + 1, maxDepth)];
      }
      return [];

    case "object":
    default:
      if (schema.properties) {
        const obj: Record<string, unknown> = {};
        for (const [propName, propSchema] of Object.entries(schema.properties)) {
          // If required is specified, always include required; include optional up to depth 2
          const isRequired = (schema.required || []).includes(propName);
          if (isRequired || depth < 2) {
            obj[propName] = sampleValidSchema(propSchema, depth + 1, maxDepth);
          }
        }
        return obj;
      }
      return {};
  }
}

export function sampleInvalidValueForType(type?: string | string[]): unknown {
  const t = Array.isArray(type) ? type[0] : type;
  switch (t) {
    case "integer":
    case "number":
      return "not-a-number";
    case "string":
      return 123456;
    case "boolean":
      return "neither-true-nor-false";
    case "array":
      return "not-an-array";
    case "object":
      return "not-an-object";
    default:
      return null;
  }
}
