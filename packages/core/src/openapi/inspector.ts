import { OpenApiSpec } from "./types.js";

export interface SpecInspectionSummary {
  title: string;
  version: string;
  openapiVersion: string;
  description?: string;
  endpointCount: number;
  operationCount: number;
  schemaCount: number;
  securitySchemes: string[];
  operations: Array<{
    method: string;
    path: string;
    operationId?: string;
    summary?: string;
    authRequired: boolean;
    hasRequestBody: boolean;
    responseCodes: string[];
  }>;
}

export function inspectOpenApi(spec: OpenApiSpec): SpecInspectionSummary {
  const operations: SpecInspectionSummary["operations"] = [];
  const methods: Array<"get" | "post" | "put" | "patch" | "delete" | "head" | "options"> = [
    "get", "post", "put", "patch", "delete", "head", "options"
  ];

  for (const [pathStr, pathItem] of Object.entries(spec.paths || {})) {
    for (const m of methods) {
      const op = pathItem[m];
      if (!op) continue;

      const hasAuth = !!((op.security && op.security.length > 0) || (spec.security && spec.security.length > 0));

      operations.push({
        method: m.toUpperCase(),
        path: pathStr,
        operationId: op.operationId,
        summary: op.summary,
        authRequired: hasAuth,
        hasRequestBody: !!op.requestBody,
        responseCodes: Object.keys(op.responses || {})
      });
    }
  }

  const securitySchemes = Object.keys(spec.components?.securitySchemes || {});
  const schemaCount = Object.keys(spec.components?.schemas || {}).length;

  return {
    title: spec.info?.title || "Untitled API",
    version: spec.info?.version || "1.0.0",
    openapiVersion: spec.openapi || "3.0.0",
    description: spec.info?.description,
    endpointCount: Object.keys(spec.paths || {}).length,
    operationCount: operations.length,
    schemaCount,
    securitySchemes,
    operations
  };
}

export function formatInspectionSummary(summary: SpecInspectionSummary): string {
  const lines: string[] = [];

  lines.push(`  OPENAPI CONTRACT INSPECTION`);
  lines.push(`  ===========================`);
  lines.push(`  Title:       ${summary.title} (v${summary.version})`);
  lines.push(`  OpenAPI:     ${summary.openapiVersion}`);
  if (summary.description) {
    lines.push(`  Description: ${summary.description}`);
  }
  lines.push("");
  lines.push(`  Endpoints:   ${summary.endpointCount}`);
  lines.push(`  Operations:  ${summary.operationCount}`);
  lines.push(`  Schemas:     ${summary.schemaCount}`);
  lines.push(`  Auth Types:  ${summary.securitySchemes.length > 0 ? summary.securitySchemes.join(", ") : "None"}`);
  lines.push("");
  lines.push(`  OPERATIONS LIST:`);
  lines.push(`  ----------------`);

  for (const op of summary.operations) {
    const authTag = op.authRequired ? "[AUTH]" : "      ";
    const bodyTag = op.hasRequestBody ? "[BODY]" : "      ";
    const responses = op.responseCodes.join(", ");
    lines.push(`  ${op.method.padEnd(7)} ${op.path.padEnd(25)} ${authTag} ${bodyTag} -> ${responses}`);
  }

  lines.push("");
  return lines.join("\n");
}

export const inspectOpenApiSpec = inspectOpenApi;
