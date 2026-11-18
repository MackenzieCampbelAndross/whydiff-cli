export interface OpenApiSchema {
  type?: string | string[];
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  items?: OpenApiSchema;
  enum?: unknown[];
  nullable?: boolean;
  minimum?: number;
  maximum?: number;
  format?: string;
  description?: string;
  default?: unknown;
  example?: unknown;
  $ref?: string;
  [key: string]: unknown;
}

export interface OpenApiParameter {
  name: string;
  in: "query" | "header" | "path" | "cookie";
  description?: string;
  required?: boolean;
  schema?: OpenApiSchema;
  example?: unknown;
  $ref?: string;
}

export interface OpenApiMediaType {
  schema?: OpenApiSchema;
  example?: unknown;
  examples?: Record<string, unknown>;
}

export interface OpenApiRequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, OpenApiMediaType>;
}

export interface OpenApiResponse {
  description: string;
  content?: Record<string, OpenApiMediaType>;
  headers?: Record<string, { schema?: OpenApiSchema; description?: string }>;
}

export interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses: Record<string, OpenApiResponse>;
  security?: Array<Record<string, string[]>>;
  tags?: string[];
}

export interface OpenApiPathItem {
  summary?: string;
  description?: string;
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
  patch?: OpenApiOperation;
  delete?: OpenApiOperation;
  head?: OpenApiOperation;
  options?: OpenApiOperation;
  parameters?: OpenApiParameter[];
}

export interface OpenApiSecurityScheme {
  type: "http" | "apiKey" | "oauth2" | "openIdConnect";
  description?: string;
  name?: string;
  in?: "header" | "query" | "cookie";
  scheme?: "bearer" | "basic" | string;
  bearerFormat?: string;
}

export interface OpenApiComponents {
  schemas?: Record<string, OpenApiSchema>;
  responses?: Record<string, OpenApiResponse>;
  parameters?: Record<string, OpenApiParameter>;
  requestBodies?: Record<string, OpenApiRequestBody>;
  securitySchemes?: Record<string, OpenApiSecurityScheme>;
}

export interface OpenApiSpec {
  openapi: string; // "3.0.x" or "3.1.x"
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, OpenApiPathItem>;
  components?: OpenApiComponents;
  security?: Array<Record<string, string[]>>;
}

export type ContractDeltaKind =
  | "endpoint_removed"
  | "endpoint_added"
  | "method_removed"
  | "method_added"
  | "request_required_field_added"
  | "request_required_field_removed"
  | "request_field_type_changed"
  | "response_status_code_removed"
  | "response_status_code_added"
  | "response_field_removed"
  | "response_field_type_changed"
  | "parameter_required_added"
  | "parameter_removed"
  | "enum_value_removed"
  | "enum_value_added"
  | "auth_scheme_changed";

export interface ContractDelta {
  id: string;
  kind: ContractDeltaKind;
  severity: "breaking" | "risky" | "changed" | "informational";
  path: string;
  method?: string;
  description: string;
  before?: unknown;
  after?: unknown;
}

export interface ContractDiffResult {
  baselineTitle: string;
  baselineVersion: string;
  candidateTitle: string;
  candidateVersion: string;
  isBreaking: boolean;
  breakingCount: number;
  riskyCount: number;
  changedCount: number;
  informationalCount: number;
  deltas: ContractDelta[];
}
