#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { runInit } from "../commands/init.js";
import { runDiff } from "../commands/diff.js";
import { runBehavior } from "../commands/behavior.js";
import { runExplain } from "../commands/explain.js";
import { runReport } from "../commands/report.js";
import { runCi } from "../commands/ci.js";
import { CliError } from "../errors/cli-error.js";

const program = new Command();

program
  .name("whydiff")
  .description("WHYDIFF - Behavioral Change Detection and Verification Infrastructure")
  .version("0.1.0");

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
  .action(async opts => {
    try {
      const exitCode = await runCi(opts);
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
