import { OpenApiSpec, OpenApiOperation, OpenApiParameter } from "../../openapi/types.js";
import { HttpMethod, HttpProbe } from "../types.js";
import { sampleValidSchema, sampleInvalidValueForType } from "./schema-sampler.js";

export interface ProbeGenerationOptions {
  includeInvalid?: boolean;
  validOnly?: boolean;
  invalidOnly?: boolean;
  maxProbesPerEndpoint?: number;
  maxDepth?: number;
  tags?: string[];
}

export function generateProbesFromSpec(
  spec: OpenApiSpec,
  options: ProbeGenerationOptions = {}
): HttpProbe[] {
  const probes: HttpProbe[] = [];
  const includeInvalid = options.validOnly ? false : (options.includeInvalid !== false);
  const includeValid = !options.invalidOnly;
  const maxPerEndpoint = options.maxProbesPerEndpoint || 6;
  const maxDepth = options.maxDepth || 4;

  const methods: Array<"get" | "post" | "put" | "patch" | "delete" | "head" | "options"> = [
    "get", "post", "put", "patch", "delete", "head", "options"
  ];

  for (const [pathTemplate, pathItem] of Object.entries(spec.paths || {})) {
    for (const m of methods) {
      const op = pathItem[m];
      if (!op) continue;

      const endpointProbes: HttpProbe[] = [];
      const httpMethod = m.toUpperCase() as HttpMethod;
      const cleanPathSlug = pathTemplate.replace(/[{}]/g, "").replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "");
      const baseId = `gen_${m}_${cleanPathSlug}`;

      // 1. Resolve path and query parameters
      const { pathUrl, queryParams } = resolveParameters(pathTemplate, op.parameters);

      // 2. Generate valid happy-path request body
      const reqSchema = op.requestBody?.content?.["application/json"]?.schema;
      const validPayload = reqSchema ? sampleValidSchema(reqSchema, 0, maxDepth) : undefined;

      // 3. Create canonical valid probe
      if (includeValid) {
        endpointProbes.push({
          id: `${baseId}_valid`,
          name: `${httpMethod} ${pathTemplate} - Valid request`,
          method: httpMethod,
          path: pathUrl,
          query: Object.keys(queryParams).length > 0 ? queryParams : undefined,
          payload: validPayload,
          tags: [...(op.tags || []), "generated", "valid"],
          category: "valid",
          intent: "success",
          sourcePath: pathTemplate
        });
      }

      // 4. Generate boundary and invalid error-testing probes if requested
      if (includeInvalid && reqSchema && reqSchema.properties && endpointProbes.length < maxPerEndpoint) {
        const requiredFields = reqSchema.required || [];

        // Missing required field probes
        for (const reqField of requiredFields) {
          if (endpointProbes.length >= maxPerEndpoint) break;

          if (validPayload && typeof validPayload === "object") {
            const mutatedPayload = { ...(validPayload as Record<string, unknown>) };
            delete mutatedPayload[reqField];

            endpointProbes.push({
              id: `${baseId}_missing_${reqField}`,
              name: `${httpMethod} ${pathTemplate} - Missing required field '${reqField}'`,
              method: httpMethod,
              path: pathUrl,
              query: Object.keys(queryParams).length > 0 ? queryParams : undefined,
              payload: mutatedPayload,
              tags: [...(op.tags || []), "generated", "invalid", "missing-field"],
              category: "invalid",
              intent: "validation_error",
              sourcePath: pathTemplate
            });
          }
        }

        // Invalid type probes
        for (const [propName, propSchema] of Object.entries(reqSchema.properties)) {
          if (endpointProbes.length >= maxPerEndpoint) break;

          if (validPayload && typeof validPayload === "object") {
            const mutatedPayload = { ...(validPayload as Record<string, unknown>) };
            mutatedPayload[propName] = sampleInvalidValueForType(propSchema.type);

            endpointProbes.push({
              id: `${baseId}_badtype_${propName}`,
              name: `${httpMethod} ${pathTemplate} - Invalid type for '${propName}'`,
              method: httpMethod,
              path: pathUrl,
              query: Object.keys(queryParams).length > 0 ? queryParams : undefined,
              payload: mutatedPayload,
              tags: [...(op.tags || []), "generated", "invalid", "bad-type"],
              category: "invalid",
              intent: "validation_error",
              sourcePath: pathTemplate
            });
          }
        }

        // Enum violation probe
        for (const [propName, propSchema] of Object.entries(reqSchema.properties)) {
          if (endpointProbes.length >= maxPerEndpoint) break;

          if (propSchema.enum && propSchema.enum.length > 0) {
            const mutatedPayload = { ...((validPayload as Record<string, unknown>) || {}) };
            mutatedPayload[propName] = "INVALID_ENUM_UNRECOGNIZED_VALUE";

            endpointProbes.push({
              id: `${baseId}_badenum_${propName}`,
              name: `${httpMethod} ${pathTemplate} - Enum violation for '${propName}'`,
              method: httpMethod,
              path: pathUrl,
              query: Object.keys(queryParams).length > 0 ? queryParams : undefined,
              payload: mutatedPayload,
              tags: [...(op.tags || []), "generated", "invalid", "enum-violation"],
              category: "invalid",
              intent: "validation_error",
              sourcePath: pathTemplate
            });
          }
        }
      }

      probes.push(...endpointProbes.slice(0, maxPerEndpoint));
    }
  }

  // Sort deterministically by id
  return probes.sort((a, b) => a.id.localeCompare(b.id));
}

function resolveParameters(
  pathTemplate: string,
  parameters?: OpenApiParameter[]
): { pathUrl: string; queryParams: Record<string, string> } {
  let pathUrl = pathTemplate;
  const queryParams: Record<string, string> = {};

  for (const param of parameters || []) {
    const sampleVal = sampleValidSchema(param.schema) ?? "test-param";
    const strVal = String(sampleVal);

    if (param.in === "path") {
      pathUrl = pathUrl.replace(`{${param.name}}`, encodeURIComponent(strVal));
    } else if (param.in === "query" && (param.required || param.example)) {
      queryParams[param.name] = strVal;
    }
  }

  // Fallback for any unreplaced path parameters like {id}
  pathUrl = pathUrl.replace(/\{([^}]+)\}/g, "123");

  return { pathUrl, queryParams };
}

export const generateProbesFromOpenApi = generateProbesFromSpec;
