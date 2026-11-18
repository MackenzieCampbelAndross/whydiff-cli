import { z } from "zod";

export const ProjectConfigSchema = z.object({
  name: z.string().min(1, "Project name cannot be empty"),
  framework: z.enum(["fastify"], {
    errorMap: () => ({ message: "Only 'fastify' is supported in Phase 0" })
  })
});

export const ApplicationConfigSchema = z.object({
  entrypoint: z.string({ required_error: "Application entrypoint must be specified" }).min(1, "Application entrypoint must be specified"),
  export: z.string().default("buildApp")
});

export const ComparisonConfigSchema = z.object({
  timeout_ms: z.number().int().positive().default(10000),
  include_headers: z.array(z.string()).default([]),
  ignore_headers: z.array(z.string()).default([
    "date",
    "x-request-id",
    "etag",
    "last-modified",
    "transfer-encoding",
    "connection",
    "keep-alive"
  ])
});

export const ExecutionConfigSchema = z.object({
  install_dependencies: z.boolean().default(true),
  cleanup_worktrees: z.boolean().default(true)
});

export const ProbesConfigSchema = z.object({
  file: z.string().default(".whydiff/probes.json")
});

export const ReportConfigSchema = z.object({
  directory: z.string().default(".whydiff/reports"),
  format: z.enum(["terminal", "json"]).default("terminal")
});

export const CiConfigSchema = z.object({
  fail_on: z.enum(["breaking", "risky", "changed", "never"]).default("breaking")
});

export const WhydiffConfigSchema = z.object({
  version: z.literal(1),
  project: ProjectConfigSchema,
  application: ApplicationConfigSchema,
  comparison: ComparisonConfigSchema.default({}),
  execution: ExecutionConfigSchema.default({}),
  probes: ProbesConfigSchema.default({}),
  report: ReportConfigSchema.default({}),
  ci: CiConfigSchema.default({})
});

export type WhydiffConfig = z.infer<typeof WhydiffConfigSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type ApplicationConfig = z.infer<typeof ApplicationConfigSchema>;
export type ComparisonConfig = z.infer<typeof ComparisonConfigSchema>;
export type ExecutionConfig = z.infer<typeof ExecutionConfigSchema>;
export type ProbesConfig = z.infer<typeof ProbesConfigSchema>;
export type ReportConfig = z.infer<typeof ReportConfigSchema>;
export type CiConfig = z.infer<typeof CiConfigSchema>;
