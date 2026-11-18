import { z } from "zod";

export const ReliabilityConfigSchema = z.object({
  max_retries: z.number().int().min(0).max(10).default(2),
  backoff_ms: z.number().int().min(0).default(50),
  backoff_factor: z.number().min(1).default(2),
  retry_non_idempotent: z.boolean().default(false),
  retry_status_codes: z.array(z.number().int()).default([502, 503, 504]),
  connection_timeout_ms: z.number().int().positive().default(5000),
  request_timeout_ms: z.number().int().positive().default(10000)
});

export type ReliabilityConfig = z.infer<typeof ReliabilityConfigSchema>;

export type ExecutionFailureType =
  | "timeout"
  | "connection_failure"
  | "malformed_json"
  | "unexpected_content_type"
  | "application_error";
