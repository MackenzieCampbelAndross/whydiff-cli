import path from "node:path";
import chalk from "chalk";
import Table from "cli-table3";
import {
  parseOpenApiSpec,
  inspectOpenApiSpec,
  diffOpenApiSpecs,
  formatContractDiffReport
} from "@whydiff/core";
import { CliError } from "../errors/cli-error.js";

export interface ContractInspectOptions {
  json?: boolean;
}

export interface ContractDiffOptions {
  json?: boolean;
}

export async function runContractInspect(specPath: string, options: ContractInspectOptions = {}): Promise<void> {
  const resolvedPath = path.resolve(process.cwd(), specPath);
  let parsed;
  try {
    parsed = await parseOpenApiSpec(resolvedPath);
  } catch (err: unknown) {
    throw new CliError(`Failed to parse OpenAPI specification: ${(err as Error).message}`, 2);
  }

  const inspection = inspectOpenApiSpec(parsed);

  if (options.json) {
    console.log(JSON.stringify(inspection, null, 2));
    return;
  }

  console.log(chalk.bold("\n  OPENAPI CONTRACT INSPECTION"));
  console.log("  ===========================");
  console.log(`  Title:            ${chalk.cyan(inspection.title)}`);
  console.log(`  Version:          ${inspection.version}`);
  console.log(`  OpenAPI Version:  ${inspection.openapiVersion}`);
  if (inspection.description) {
    console.log(`  Description:      ${inspection.description}`);
  }
  console.log(`  Total Endpoints:  ${inspection.endpointCount}`);
  console.log(`  Total Schemas:    ${inspection.schemaCount}`);
  console.log(`  Security Schemes: ${inspection.securitySchemes.length > 0 ? inspection.securitySchemes.join(", ") : "None"}`);
  console.log("");

  if (inspection.operations.length > 0) {
    const table = new Table({
      head: [chalk.bold("Method"), chalk.bold("Path"), chalk.bold("Auth"), chalk.bold("Body"), chalk.bold("Responses")],
      colWidths: [10, 30, 10, 8, 20]
    });

    for (const ep of inspection.operations) {
      table.push([
        chalk.green(ep.method.toUpperCase()),
        ep.path,
        ep.authRequired ? chalk.yellow("Yes") : "No",
        ep.hasRequestBody ? chalk.cyan("Yes") : "No",
        ep.responseCodes.join(", ")
      ]);
    }
    console.log(table.toString());
  }
  console.log("");
}

export async function runContractDiff(
  baselinePath: string,
  candidatePath: string,
  options: ContractDiffOptions = {}
): Promise<number> {
  const resolvedBase = path.resolve(process.cwd(), baselinePath);
  const resolvedCand = path.resolve(process.cwd(), candidatePath);

  let parsedBase;
  let parsedCand;
  try {
    parsedBase = await parseOpenApiSpec(resolvedBase);
  } catch (err: unknown) {
    throw new CliError(`Failed to parse baseline specification: ${(err as Error).message}`, 2);
  }

  try {
    parsedCand = await parseOpenApiSpec(resolvedCand);
  } catch (err: unknown) {
    throw new CliError(`Failed to parse candidate specification: ${(err as Error).message}`, 2);
  }

  const diffResult = diffOpenApiSpecs(parsedBase, parsedCand);

  if (options.json) {
    console.log(JSON.stringify(diffResult, null, 2));
  } else {
    console.log(formatContractDiffReport(diffResult));
  }

  // Return exit code 1 if breaking changes detected, otherwise 0
  if (diffResult.breakingCount > 0) {
    return 1;
  }
  return 0;
}
