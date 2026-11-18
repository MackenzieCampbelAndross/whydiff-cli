import path from "node:path";
import chalk from "chalk";
import { isGitRepo, initProject } from "@whydiff/core";
import { CliError } from "../errors/cli-error.js";

export interface InitCommandOptions {
  overwrite?: boolean;
  name?: string;
  entrypoint?: string;
}

export async function runInit(targetDir = ".", options: InitCommandOptions = {}): Promise<void> {
  const resolvedDir = path.resolve(targetDir);

  const isRepo = await isGitRepo(resolvedDir);
  if (!isRepo) {
    throw new CliError(`Target directory '${resolvedDir}' is not inside a Git repository. Please initialize git first.`);
  }

  try {
    const result = await initProject({
      rootDir: resolvedDir,
      name: options.name,
      entrypoint: options.entrypoint,
      overwrite: options.overwrite
    });

    console.log(chalk.green("✓ Initialized WHYDIFF configuration successfully:"));
    console.log(`  Config file:  ${chalk.cyan(result.configPath)}`);
    console.log(`  Probes file:  ${chalk.cyan(result.probesPath)}`);
    console.log("");
    console.log(chalk.bold("Next steps:"));
    console.log(`  1. Define HTTP probes in ${chalk.cyan(".whydiff/probes.json")}`);
    console.log(`  2. Ensure your Fastify factory is exported in ${chalk.cyan("src/app.ts")}`);
    console.log(`  3. Run behavioral diff between revisions:`);
    console.log(`     ${chalk.yellow("whydiff diff main..HEAD")}`);
  } catch (err: unknown) {
    throw new CliError((err as Error).message, 2);
  }
}
