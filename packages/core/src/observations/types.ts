import { ExecutionFailureType } from "../reliability/types.js";

export interface ObservationRequest {
  method: string;
  path: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  payload?: unknown;
}

export interface ObservationResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  contentType?: string;
  isMalformedJson?: boolean;
}

export interface ObservationError {
  name: string;
  message: string;
  stack?: string;
  failureType?: ExecutionFailureType;
}

export interface Observation {
  probeId: string;
  revision: string;
  timestamp: string;
  request: ObservationRequest;
  response?: ObservationResponse;
  durationMs?: number;
  error?: ObservationError;
  attempts?: number;
  retryLog?: string[];
  category?: "valid" | "invalid";
  intent?: string;
  motivatedBy?: string;
}

export interface NormalizationOptions {
  includeHeaders?: string[];
  ignoreHeaders?: string[];
  redactSensitive?: boolean;
  sensitiveFields?: string[];
}
