import { z } from "zod";

export const BearerAuthSchema = z.object({
  type: z.literal("bearer"),
  token: z.string().min(1, "Bearer token or env reference required")
});

export const ApiKeyAuthSchema = z.object({
  type: z.literal("apiKey"),
  name: z.string().min(1, "API key name required (e.g. x-api-key)"),
  value: z.string().min(1, "API key value or env reference required"),
  in: z.enum(["header", "query"]).default("header")
});

export const BasicAuthSchema = z.object({
  type: z.literal("basic"),
  username: z.string(),
  password: z.string()
});

export const CustomAuthSchema = z.object({
  type: z.literal("custom"),
  headers: z.record(z.string()).default({})
});

export const AuthProfileSchema = z.discriminatedUnion("type", [
  BearerAuthSchema,
  ApiKeyAuthSchema,
  BasicAuthSchema,
  CustomAuthSchema
]);

export type AuthProfile = z.infer<typeof AuthProfileSchema>;

export const AuthConfigSchema = z.object({
  default_profile: z.string().optional(),
  baseline_profile: z.string().optional(),
  candidate_profile: z.string().optional(),
  profiles: z.record(AuthProfileSchema).default({}),
  redact_fields: z.array(z.string()).default([
    "password",
    "secret",
    "token",
    "accessToken",
    "refreshToken",
    "apiKey",
    "api_key",
    "client_secret"
  ])
});

export type AuthConfig = z.infer<typeof AuthConfigSchema>;
