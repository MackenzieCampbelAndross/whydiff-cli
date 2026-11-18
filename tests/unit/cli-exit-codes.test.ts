import { describe, it, expect } from "vitest";
import { CliError } from "@whydiff/cli";

describe("Unit: CLI Error and Exit Code Logic", () => {
  it("defaults CliError exit code to 2 (infrastructure/execution failure)", () => {
    const err = new CliError("Fatal syntax error in config");
    expect(err.exitCode).toBe(2);
    expect(err.message).toBe("Fatal syntax error in config");
  });

  it("supports custom exit codes", () => {
    const err = new CliError("Regression found", 1);
    expect(err.exitCode).toBe(1);
  });
});
