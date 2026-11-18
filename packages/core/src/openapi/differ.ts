import {
  OpenApiSpec,
  ContractDelta,
  ContractDiffResult,
  OpenApiOperation,
  OpenApiSchema
} from "./types.js";

const HTTP_METHODS: Array<"get" | "post" | "put" | "patch" | "delete" | "head" | "options"> = [
  "get", "post", "put", "patch", "delete", "head", "options"
];

export function compareOpenApi(baseline: OpenApiSpec, candidate: OpenApiSpec): ContractDiffResult {
  const deltas: ContractDelta[] = [];
  let deltaCounter = 1;

  const nextId = () => `cd_${String(deltaCounter++).padStart(3, "0")}`;

  const basePaths = Object.keys(baseline.paths || {});
  const candPaths = new Set(Object.keys(candidate.paths || {}));

  // 1. Check removed endpoints
  for (const p of basePaths) {
    if (!candPaths.has(p)) {
      deltas.push({
        id: nextId(),
        kind: "endpoint_removed",
        severity: "breaking",
        path: p,
        description: `Path '${p}' was removed from the OpenAPI contract`
      });
      continue;
    }

    const baseItem = baseline.paths[p]!;
    const candItem = candidate.paths[p]!;

    // Check methods for this path
    for (const m of HTTP_METHODS) {
      const baseOp = baseItem[m];
      const candOp = candItem[m];

      if (baseOp && !candOp) {
        deltas.push({
          id: nextId(),
          kind: "method_removed",
          severity: "breaking",
          path: p,
          method: m.toUpperCase(),
          description: `Method '${m.toUpperCase()} ${p}' was removed`
        });
      } else if (!baseOp && candOp) {
        deltas.push({
          id: nextId(),
          kind: "method_added",
          severity: "changed",
          path: p,
          method: m.toUpperCase(),
          description: `Method '${m.toUpperCase()} ${p}' was added`
        });
      } else if (baseOp && candOp) {
        // Deep compare operation: parameters, request bodies, responses, security
        compareOperations(p, m.toUpperCase(), baseOp, candOp, deltas, nextId);
      }
    }
  }

  // 2. Check added endpoints
  const basePathSet = new Set(basePaths);
  for (const p of candPaths) {
    if (!basePathSet.has(p)) {
      deltas.push({
        id: nextId(),
        kind: "endpoint_added",
        severity: "changed",
        path: p,
        description: `New path '${p}' was added to contract`
      });
    }
  }

  // 3. Check global security changes
  compareSecurity(baseline.security, candidate.security, deltas, nextId);

  const breakingCount = deltas.filter(d => d.severity === "breaking").length;
  const riskyCount = deltas.filter(d => d.severity === "risky").length;
  const changedCount = deltas.filter(d => d.severity === "changed").length;
  const informationalCount = deltas.filter(d => d.severity === "informational").length;

  return {
    baselineTitle: baseline.info?.title || "Baseline",
    baselineVersion: baseline.info?.version || "1.0.0",
    candidateTitle: candidate.info?.title || "Candidate",
    candidateVersion: candidate.info?.version || "1.0.0",
    isBreaking: breakingCount > 0,
    breakingCount,
    riskyCount,
    changedCount,
    informationalCount,
    deltas
  };
}

function compareOperations(
  pathStr: string,
  method: string,
  baseOp: OpenApiOperation,
  candOp: OpenApiOperation,
  deltas: ContractDelta[],
  nextId: () => string
): void {
  // Compare parameters
  const baseParams = new Map((baseOp.parameters || []).map(p => [`${p.in}:${p.name}`, p]));
  const candParams = new Map((candOp.parameters || []).map(p => [`${p.in}:${p.name}`, p]));

  for (const [key, bParam] of baseParams.entries()) {
    const cParam = candParams.get(key);
    if (!cParam) {
      if (bParam.required) {
        deltas.push({
          id: nextId(),
          kind: "parameter_removed",
          severity: "breaking",
          path: pathStr,
          method,
          description: `Required parameter '${bParam.name}' in ${bParam.in} was removed`
        });
      }
    }
  }

  for (const [key, cParam] of candParams.entries()) {
    const bParam = baseParams.get(key);
    if (!bParam && cParam.required) {
      deltas.push({
        id: nextId(),
        kind: "parameter_required_added",
        severity: "breaking",
        path: pathStr,
        method,
        description: `New required parameter '${cParam.name}' in ${cParam.in} was introduced`
      });
    }
  }

  // Compare request bodies
  const baseReqSchema = baseOp.requestBody?.content?.["application/json"]?.schema;
  const candReqSchema = candOp.requestBody?.content?.["application/json"]?.schema;

  if (baseReqSchema && candReqSchema) {
    compareRequestSchemas(pathStr, method, baseReqSchema, candReqSchema, deltas, nextId);
  }

  // Compare response codes and schemas
  const baseCodes = Object.keys(baseOp.responses || {});
  const candCodes = new Set(Object.keys(candOp.responses || {}));

  for (const code of baseCodes) {
    if (!candCodes.has(code)) {
      deltas.push({
        id: nextId(),
        kind: "response_status_code_removed",
        severity: "breaking",
        path: pathStr,
        method,
        description: `Response status code ${code} was removed`
      });
      continue;
    }

    const baseResSchema = baseOp.responses[code]?.content?.["application/json"]?.schema;
    const candResSchema = candOp.responses[code]?.content?.["application/json"]?.schema;

    if (baseResSchema && candResSchema) {
      compareResponseSchemas(pathStr, method, code, baseResSchema, candResSchema, deltas, nextId);
    }
  }

  for (const code of candCodes) {
    if (!baseCodes.includes(code)) {
      deltas.push({
        id: nextId(),
        kind: "response_status_code_added",
        severity: "changed",
        path: pathStr,
        method,
        description: `New response status code ${code} documented`
      });
    }
  }

  // Compare operation security
  compareSecurity(baseOp.security, candOp.security, deltas, nextId, pathStr, method);
}

function compareRequestSchemas(
  pathStr: string,
  method: string,
  base: OpenApiSchema,
  cand: OpenApiSchema,
  deltas: ContractDelta[],
  nextId: () => string,
  parent = "requestBody"
): void {
  const baseReq = new Set(base.required || []);
  const candReq = new Set(cand.required || []);

  // Newly required field in request body is BREAKING
  for (const field of candReq) {
    if (!baseReq.has(field)) {
      deltas.push({
        id: nextId(),
        kind: "request_required_field_added",
        severity: "breaking",
        path: pathStr,
        method,
        description: `Field '${parent}.${field}' is now required in request body`
      });
    }
  }

  // Removed required field in request body is COMPATIBLE
  for (const field of baseReq) {
    if (!candReq.has(field)) {
      deltas.push({
        id: nextId(),
        kind: "request_required_field_removed",
        severity: "changed",
        path: pathStr,
        method,
        description: `Field '${parent}.${field}' is no longer required in request body`
      });
    }
  }

  // Compare properties
  const baseProps = base.properties || {};
  const candProps = cand.properties || {};

  for (const [name, bProp] of Object.entries(baseProps)) {
    const cProp = candProps[name];
    if (cProp) {
      const bType = Array.isArray(bProp.type) ? bProp.type.join("|") : bProp.type;
      const cType = Array.isArray(cProp.type) ? cProp.type.join("|") : cProp.type;

      if (bType && cType && bType !== cType) {
        deltas.push({
          id: nextId(),
          kind: "request_field_type_changed",
          severity: "breaking",
          path: pathStr,
          method,
          description: `Type of request field '${parent}.${name}' changed from ${bType} to ${cType}`,
          before: bType,
          after: cType
        });
      }

      if (bProp.properties && cProp.properties) {
        compareRequestSchemas(pathStr, method, bProp, cProp, deltas, nextId, `${parent}.${name}`);
      }
    }
  }
}

function compareResponseSchemas(
  pathStr: string,
  method: string,
  status: string,
  base: OpenApiSchema,
  cand: OpenApiSchema,
  deltas: ContractDelta[],
  nextId: () => string,
  parent = "responseBody"
): void {
  const baseProps = base.properties || {};
  const candProps = cand.properties || {};

  // Removed response field is BREAKING
  for (const name of Object.keys(baseProps)) {
    if (!(name in candProps)) {
      deltas.push({
        id: nextId(),
        kind: "response_field_removed",
        severity: "breaking",
        path: pathStr,
        method,
        description: `Response field '${parent}.${name}' (HTTP ${status}) was removed from contract`
      });
    } else {
      const bProp = baseProps[name]!;
      const cProp = candProps[name]!;

      const bType = Array.isArray(bProp.type) ? bProp.type.join("|") : bProp.type;
      const cType = Array.isArray(cProp.type) ? cProp.type.join("|") : cProp.type;

      if (bType && cType && bType !== cType) {
        deltas.push({
          id: nextId(),
          kind: "response_field_type_changed",
          severity: "breaking",
          path: pathStr,
          method,
          description: `Response field '${parent}.${name}' type changed from ${bType} to ${cType}`
        });
      }

      // Check enums
      if (bProp.enum && cProp.enum) {
        const cEnumSet = new Set(cProp.enum);
        for (const val of bProp.enum) {
          if (!cEnumSet.has(val)) {
            deltas.push({
              id: nextId(),
              kind: "enum_value_removed",
              severity: "breaking",
              path: pathStr,
              method,
              description: `Enum value '${JSON.stringify(val)}' was removed from '${parent}.${name}'`
            });
          }
        }
      }

      if (bProp.properties && cProp.properties) {
        compareResponseSchemas(pathStr, method, status, bProp, cProp, deltas, nextId, `${parent}.${name}`);
      }
    }
  }
}

function compareSecurity(
  baseSec?: Array<Record<string, string[]>>,
  candSec?: Array<Record<string, string[]>>,
  deltas: ContractDelta[] = [],
  nextId: () => string = () => "",
  pathStr = "global",
  method?: string
): void {
  const baseList = (baseSec || []).map(s => Object.keys(s).sort().join(","));
  const candList = (candSec || []).map(s => Object.keys(s).sort().join(","));

  if (baseList.join(";") !== candList.join(";")) {
    const isMoreRestrictive = (candSec?.length || 0) > (baseSec?.length || 0);
    deltas.push({
      id: nextId(),
      kind: "auth_scheme_changed",
      severity: isMoreRestrictive ? "breaking" : "risky",
      path: pathStr,
      method,
      description: `Authentication requirements changed for ${method ? `${method} ` : ""}${pathStr}`,
      before: baseSec,
      after: candSec
    });
  }
}

export const diffOpenApiSpecs = compareOpenApi;
