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
}

export interface ObservationError {
  name: string;
  message: string;
  stack?: string;
}

export interface Observation {
  probeId: string;
  revision: string;
  timestamp: string;
  request: ObservationRequest;
  response?: ObservationResponse;
  durationMs?: number;
  error?: ObservationError;
}

export interface NormalizationOptions {
  includeHeaders?: string[];
  ignoreHeaders?: string[];
  redactSensitive?: boolean;
}
