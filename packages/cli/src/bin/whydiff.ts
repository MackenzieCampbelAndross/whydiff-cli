#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { runInit } from "../commands/init.js";
import { runDiff } from "../commands/diff.js";
import { runBehavior } from "../commands/behavior.js";
import { runExplain } from "../commands/explain.js";
import { runReport } from "../commands/report.js";
import { runCi } from "../commands/ci.js";
import { runContractInspect, runContractDiff } from "../commands/contract.js";
import { runProbeGenerate, runProbeList } from "../commands/probe.js";
import { runAuthValidate } from "../commands/auth.js";
import { CliError } from "../errors/cli-error.js";

const program = new Command();

program
  .name("whydiff")
  .description("WHYDIFF - Behavioral Change Detection and Verification Infrastructure")
  .version("0.2.0");

program
  .command("init [dir]")
  .description("Initialize a WHYDIFF project configuration in the current or target directory")
  .option("--overwrite", "Overwrite existing configuration if present")
  .option("--name <name>", "Project name")
  .option("--entrypoint <entrypoint>", "Application entrypoint file path")
  .action(async (dir, opts) => {
    try {
      await runInit(dir, opts);
      process.exit(0);
    } catch (err: unknown) {
      handleError(err);
    }
  });

program
  .command("diff <revisions>")
  .description("Execute behavioral diff between two revisions (e.g. main..HEAD)")
  .option("-c, --config <path>", "Path to .whydiff.toml configuration file")
  .option("-v, --verbose", "Display verbose evidence details")
  .option("--openapi-baseline <path>", "Path to baseline OpenAPI specification")
  .option("--openapi-candidate <path>", "Path to candidate OpenAPI specification")
  .option("--auth-profile <name>", "Authentication profile name to apply")
  .action(async (revisions, opts) => {
    try {
      const exitCode = await runDiff(revisions, opts);
      process.exit(exitCode);
    } catch (err: unknown) {
      handleError(err);
    }
  });

program
  .command("behavior <revisions>")
  .description("Execute probes and display detailed technical behavioral comparison")
  .option("-c, --config <path>", "Path to .whydiff.toml configuration file")
  .option("--openapi-baseline <path>", "Path to baseline OpenAPI specification")
  .option("--openapi-candidate <path>", "Path to candidate OpenAPI specification")
  .option("--auth-profile <name>", "Authentication profile name to apply")
  .action(async (revisions, opts) => {
    try {
      const exitCode = await runBehavior(revisions, opts);
      process.exit(exitCode);
    } catch (err: unknown) {
      handleError(err);
    }
  });

program
  .command("explain <delta-id>")
  .description("Explain an observed behavioral delta in detail")
  .option("-r, --run <run-id>", "Analysis run identifier (defaults to latest)")
  .option("-c, --config <path>", "Path to .whydiff.toml configuration file")
  .action(async (deltaId, opts) => {
    try {
      await runExplain(deltaId, opts);
      process.exit(0);
    } catch (err: unknown) {
      handleError(err);
    }
  });

program
  .command("report")
  .description("View or export an analysis report")
  .option("-f, --format <format>", "Report format: 'terminal' or 'json'", "terminal")
  .option("-r, --run <run-id>", "Analysis run identifier (defaults to latest)")
  .option("-c, --config <path>", "Path to .whydiff.toml configuration file")
  .action(async opts => {
    try {
      await runReport(opts);
      process.exit(0);
    } catch (err: unknown) {
      handleError(err);
    }
  });

program
  .command("ci")
  .description("Execute behavioral diff with CI failure policy")
  .option("-b, --base <ref>", "Baseline Git reference (defaults to 'main')", "main")
  .option("-k, --candidate <ref>", "Candidate Git reference (defaults to 'HEAD')", "HEAD")
  .option("--fail-on <policy>", "Failure policy: 'breaking', 'risky', 'changed', 'never'")
  .option("-c, --config <path>", "Path to .whydiff.toml configuration file")
  .option("--openapi-baseline <path>", "Path to baseline OpenAPI specification")
  .option("--openapi-candidate <path>", "Path to candidate OpenAPI specification")
  .option("--auth-profile <name>", "Authentication profile name to apply")
  .action(async opts => {
    try {
      const exitCode = await runCi(opts);
      process.exit(exitCode);
    } catch (err: unknown) {
      handleError(err);
    }
  });

// Contract Command Group
const contractCmd = program
  .command("contract")
  .description("OpenAPI contract intelligence and comparison commands");

contractCmd
  .command("inspect <spec-path>")
  .description("Inspect an OpenAPI 3.0 or 3.1 specification (JSON or YAML)")
  .option("--json", "Output inspection result as structured JSON")
  .action(async (specPath, opts) => {
    try {
      await runContractInspect(specPath, opts);
      process.exit(0);
    } catch (err: unknown) {
      handleError(err);
    }
  });

contractCmd
  .command("diff <baseline-spec> <candidate-spec>")
  .description("Compare two OpenAPI specifications and identify breaking or compatible schema changes")
  .option("--json", "Output diff result as structured JSON")
  .action(async (baselineSpec, candidateSpec, opts) => {
    try {
      const exitCode = await runContractDiff(baselineSpec, candidateSpec, opts);
      process.exit(exitCode);
    } catch (err: unknown) {
      handleError(err);
    }
  });

// Probe Command Group
const probeCmd = program
  .command("probe")
  .description("Probe generation, inspection, and listing commands");

probeCmd
  .command("generate <spec-path>")
  .description("Generate HTTP probes from an OpenAPI specification")
  .option("-o, --output <path>", "File path to write generated probes (JSON)")
  .option("--valid-only", "Generate only valid probes")
  .option("--invalid-only", "Generate only invalid/boundary probes")
  .option("-l, --limit <number>", "Maximum probes per endpoint")
  .option("--json", "Output generated probes as JSON to stdout")
  .action(async (specPath, opts) => {
    try {
      await runProbeGenerate(specPath, opts);
      process.exit(0);
    } catch (err: unknown) {
      handleError(err);
    }
  });

probeCmd
  .command("list")
  .description("List configured probes in .whydiff.toml")
  .option("-c, --config <path>", "Path to .whydiff.toml configuration file")
  .option("--json", "Output list as JSON")
  .action(async opts => {
    try {
      await runProbeList(opts);
      process.exit(0);
    } catch (err: unknown) {
      handleError(err);
    }
  });

// Auth Command Group
const authCmd = program
  .command("auth")
  .description("Authentication profile validation commands");

authCmd
  .command("validate [profile]")
  .description("Validate configured authentication profile credentials and secrets")
  .option("-c, --config <path>", "Path to .whydiff.toml configuration file")
  .option("--json", "Output validation result as JSON")
  .action(async (profile, opts) => {
    try {
      const exitCode = await runAuthValidate(profile, opts);
      process.exit(exitCode);
    } catch (err: unknown) {
      handleError(err);
    }
  });

function handleError(err: unknown): void {
  if (err instanceof CliError) {
    console.error(chalk.red(`Error: ${err.message}`));
    process.exit(err.exitCode);
  }
  const error = err as Error;
  console.error(chalk.red(`Fatal Error: ${error.message}`));
  if (process.env.DEBUG) {
    console.error(error.stack);
  }
  process.exit(2);
}

program.parse(process.argv);
