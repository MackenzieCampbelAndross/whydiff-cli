import { z } from "zod";

export const HttpMethodSchema = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS"
]);

export type HttpMethod = z.infer<typeof HttpMethodSchema>;

export const HttpProbeSchema = z.object({
  id: z.string().min(1, "Probe id is required"),
  name: z.string().min(1, "Probe name is required"),
  method: HttpMethodSchema.default("GET"),
  path: z.string().startsWith("/", "Probe path must begin with '/'"),
  headers: z.record(z.string()).optional(),
  query: z.record(z.string()).optional(),
  payload: z.unknown().optional(),
  tags: z.array(z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
  category: z.enum(["valid", "invalid"]).optional(),
  intent: z.enum(["success", "validation_error", "auth_error", "differential"]).optional(),
  motivatedBy: z.string().optional(),
  sourcePath: z.string().optional()
});

export type HttpProbe = z.infer<typeof HttpProbeSchema>;

export const ProbesFileSchema = z.object({
  probes: z.array(HttpProbeSchema).min(1, "At least one probe must be configured")
});

export type ProbesFile = z.infer<typeof ProbesFileSchema>;
