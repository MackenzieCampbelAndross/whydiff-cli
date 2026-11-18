import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { OpenApiSpec, OpenApiSchema } from "./types.js";

export class OpenApiParseError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = "OpenApiParseError";
  }
}

export function parseOpenApi(rawContent: string, sourceName = "spec"): OpenApiSpec {
  let parsed: unknown;
  const trimmed = rawContent.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      parsed = JSON.parse(rawContent);
    } catch (err) {
      throw new OpenApiParseError(`Failed to parse OpenAPI JSON from ${sourceName}: ${(err as Error).message}`);
    }
  } else {
    try {
      parsed = parseYaml(rawContent, { prettyErrors: true });
    } catch (err) {
      throw new OpenApiParseError(`Failed to parse OpenAPI YAML from ${sourceName}: ${(err as Error).message}`);
    }
  }

  if (!parsed || typeof parsed !== "object") {
    throw new OpenApiParseError(`Invalid OpenAPI document in ${sourceName}: root must be an object`);
  }

  const spec = parsed as Record<string, unknown>;

  if (!spec["openapi"] || typeof spec["openapi"] !== "string") {
    throw new OpenApiParseError(
      `Unsupported or missing OpenAPI version in ${sourceName}. Must define 'openapi: 3.0.x' or '3.1.x'`
    );
  }

  const version = spec["openapi"].trim();
  if (!version.startsWith("3.0") && !version.startsWith("3.1")) {
    throw new OpenApiParseError(
      `Unsupported OpenAPI version '${version}' in ${sourceName}. Phase 1 requires OpenAPI 3.0 or 3.1`
    );
  }

  if (!spec["info"] || typeof spec["info"] !== "object") {
    throw new OpenApiParseError(`Missing or invalid 'info' block in ${sourceName}`);
  }

  if (!spec["paths"] || typeof spec["paths"] !== "object") {
    spec["paths"] = {};
  }

  const resolved = resolveInternalRefs(spec as unknown as OpenApiSpec);
  return resolved;
}

export async function loadOpenApi(specPathOrContent: string, rootDir = process.cwd()): Promise<OpenApiSpec> {
  const trimmed = specPathOrContent.trim();
  // Check if string is direct JSON/YAML content
  if (trimmed.startsWith("{") || trimmed.includes("openapi:")) {
    return parseOpenApi(specPathOrContent, "inline-content");
  }

  const resolvedPath = path.isAbsolute(specPathOrContent)
    ? specPathOrContent
    : path.resolve(rootDir, specPathOrContent);

  let content: string;
  try {
    content = await fs.readFile(resolvedPath, "utf-8");
  } catch (err) {
    throw new OpenApiParseError(`Cannot read OpenAPI file at ${resolvedPath}: ${(err as Error).message}`);
  }

  return parseOpenApi(content, resolvedPath);
}

export const parseOpenApiSpec = loadOpenApi;

export function resolveInternalRefs(spec: OpenApiSpec): OpenApiSpec {
  const root = spec;

  function lookupRef(ref: string): unknown {
    if (!ref.startsWith("#/")) return undefined;
    const parts = ref.substring(2).split("/");
    let current: unknown = root;
    for (const part of parts) {
      if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return current;
  }

  function resolveSchema(schema: unknown, depth = 0, seen = new Set<unknown>()): unknown {
    if (!schema || typeof schema !== "object" || depth > 20) {
      return schema;
    }

    if (seen.has(schema)) {
      return schema; // prevent circular recursion
    }
    seen.add(schema);

    const s = { ...(schema as Record<string, unknown>) };

    if (typeof s["$ref"] === "string") {
      const target = lookupRef(s["$ref"]);
      if (target && typeof target === "object") {
        const resolvedTarget = resolveSchema(target, depth + 1, seen) as Record<string, unknown>;
        return { ...resolvedTarget, ...s, $ref: undefined };
      }
    }

    if (s["properties"] && typeof s["properties"] === "object") {
      const newProps: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(s["properties"] as Record<string, unknown>)) {
        newProps[k] = resolveSchema(v, depth + 1, seen);
      }
      s["properties"] = newProps;
    }

    if (s["items"]) {
      s["items"] = resolveSchema(s["items"], depth + 1, seen);
    }

    return s;
  }

  // Clone spec to avoid mutating original
  const cloned = JSON.parse(JSON.stringify(spec)) as OpenApiSpec;

  for (const [pathStr, pathItem] of Object.entries(cloned.paths)) {
    const methods: Array<"get" | "post" | "put" | "patch" | "delete" | "head" | "options"> = [
      "get", "post", "put", "patch", "delete", "head", "options"
    ];

    for (const m of methods) {
      const op = pathItem[m];
      if (!op) continue;

      if (op.parameters) {
        op.parameters = op.parameters.map(p => {
          if (p.$ref) {
            const resolved = lookupRef(p.$ref) as OpenApiSchema;
            return (resolved ? { ...resolved, ...p, $ref: undefined } : p) as any;
          }
          if (p.schema) {
            p.schema = resolveSchema(p.schema) as OpenApiSchema;
          }
          return p;
        });
      }

      if (op.requestBody?.content) {
        for (const mt of Object.values(op.requestBody.content)) {
          if (mt.schema) {
            mt.schema = resolveSchema(mt.schema) as OpenApiSchema;
          }
        }
      }

      if (op.responses) {
        for (const res of Object.values(op.responses)) {
          if (res.content) {
            for (const mt of Object.values(res.content)) {
              if (mt.schema) {
                mt.schema = resolveSchema(mt.schema) as OpenApiSchema;
              }
            }
          }
        }
      }
    }
  }

  return cloned;
}
