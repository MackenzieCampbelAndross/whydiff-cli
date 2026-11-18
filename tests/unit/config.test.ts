import { describe, it, expect } from "vitest";
import { parseConfigString, getDefaultConfig, generateTomlConfig, ConfigError } from "@whydiff/core";

describe("Unit: Configuration Engine", () => {
  it("parses valid TOML configuration", () => {
    const toml = `
      version = 1

      [project]
      name = "user-service"
      framework = "fastify"

      [application]
      entrypoint = "src/app.ts"
      export = "buildApp"

      [comparison]
      timeout_ms = 5000
      include_headers = ["content-type", "x-custom"]
      ignore_headers = ["date"]

      [execution]
      install_dependencies = false
      cleanup_worktrees = true

      [probes]
      file = ".whydiff/probes.json"

      [report]
      directory = ".whydiff/reports"
      format = "json"

      [ci]
      fail_on = "risky"
    `;

    const result = parseConfigString(toml);
    expect(result.config.version).toBe(1);
    expect(result.config.project.name).toBe("user-service");
    expect(result.config.project.framework).toBe("fastify");
    expect(result.config.application.entrypoint).toBe("src/app.ts");
    expect(result.config.application.export).toBe("buildApp");
    expect(result.config.comparison.timeout_ms).toBe(5000);
    expect(result.config.comparison.include_headers).toEqual(["content-type", "x-custom"]);
    expect(result.config.comparison.ignore_headers).toEqual(["date"]);
    expect(result.config.execution.install_dependencies).toBe(false);
    expect(result.config.report.format).toBe("json");
    expect(result.config.ci.fail_on).toBe("risky");
  });

  it("applies sensible defaults for optional sections", () => {
    const minimalToml = `
      version = 1

      [project]
      name = "simple-api"
      framework = "fastify"

      [application]
      entrypoint = "index.ts"
    `;

    const result = parseConfigString(minimalToml);
    expect(result.config.application.export).toBe("buildApp");
    expect(result.config.comparison.timeout_ms).toBe(10000);
    expect(result.config.comparison.ignore_headers).toContain("date");
    expect(result.config.comparison.ignore_headers).toContain("x-request-id");
    expect(result.config.execution.install_dependencies).toBe(true);
    expect(result.config.execution.cleanup_worktrees).toBe(true);
    expect(result.config.probes.file).toBe(".whydiff/probes.json");
    expect(result.config.report.format).toBe("terminal");
    expect(result.config.ci.fail_on).toBe("breaking");
  });

  it("rejects invalid TOML syntax with ConfigError", () => {
    const malformed = `version = 1\n[invalid toml syntax here`;
    expect(() => parseConfigString(malformed)).toThrowError(ConfigError);
  });

  it("rejects unsupported framework with validation error", () => {
    const toml = `
      version = 1
      [project]
      name = "express-app"
      framework = "express"

      [application]
      entrypoint = "app.js"
    `;
    expect(() => parseConfigString(toml)).toThrowError(/Only 'fastify' is supported in Phase 0/);
  });

  it("rejects missing entrypoint", () => {
    const toml = `
      version = 1
      [project]
      name = "test"
      framework = "fastify"

      [application]
      export = "buildApp"
    `;
    expect(() => parseConfigString(toml)).toThrowError(/Application entrypoint must be specified/);
  });

  it("generates and roundtrips default configuration", () => {
    const def = getDefaultConfig("my-api", "src/server.ts", "createApp");
    const tomlString = generateTomlConfig(def);
    const parsed = parseConfigString(tomlString);

    expect(parsed.config.project.name).toBe("my-api");
    expect(parsed.config.application.entrypoint).toBe("src/server.ts");
    expect(parsed.config.application.export).toBe("createApp");
  });
});
