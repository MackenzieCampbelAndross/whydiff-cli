import chalkColors from "chalk";
import Table from "cli-table3";
import {
  loadConfig,
  resolveAuthProfile,
  redactSensitiveData,
  AuthProfile
} from "@whydiff/core";
import { CliError } from "../errors/cli-error.js";

export interface AuthValidateOptions {
  config?: string;
  json?: boolean;
}

export async function runAuthValidate(
  profileName?: string,
  options: AuthValidateOptions = {}
): Promise<number> {
  const cwd = process.cwd();
  const configPath = options.config || cwd;

  let loaded;
  try {
    loaded = await loadConfig(configPath);
  } catch (err: unknown) {
    throw new CliError(`Configuration error: ${(err as Error).message}`, 2);
  }

  const authConfig = loaded.config.auth;
  if (!authConfig || !authConfig.profiles || Object.keys(authConfig.profiles).length === 0) {
    if (options.json) {
      console.log(JSON.stringify({ status: "none", profiles: {} }, null, 2));
    } else {
      console.log(chalkColors.yellow("\n  No authentication profiles configured in .whydiff.toml"));
    }
    return 0;
  }

  const profilesToValidate: Record<string, AuthProfile> = profileName
    ? { [profileName]: authConfig.profiles[profileName]! }
    : authConfig.profiles;

  if (profileName && !authConfig.profiles[profileName]) {
    throw new CliError(`Authentication profile "${profileName}" not found in configuration`, 2);
  }

  let hasError = false;
  const results: Record<string, { valid: boolean; type: string; error?: string; redacted: unknown }> = {};

  for (const [name, profile] of Object.entries(profilesToValidate)) {
    if (!profile) continue;

    try {
      const resolved = resolveAuthProfile(profile);
      const redacted = redactSensitiveData(resolved);
      results[name] = {
        valid: true,
        type: profile.type,
        redacted
      };
    } catch (err: unknown) {
      hasError = true;
      results[name] = {
        valid: false,
        type: profile.type,
        error: (err as Error).message,
        redacted: redactSensitiveData(profile)
      };
    }
  }

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return hasError ? 1 : 0;
  }

  console.log(chalkColors.bold("\n  AUTHENTICATION PROFILE VALIDATION"));
  console.log("  =================================");
  console.log("");

  const table = new Table({
    head: [
      chalkColors.bold("Profile"),
      chalkColors.bold("Type"),
      chalkColors.bold("Status"),
      chalkColors.bold("Details / Error")
    ],
    colWidths: [20, 16, 12, 35]
  });

  for (const [name, res] of Object.entries(results)) {
    table.push([
      name,
      res.type,
      res.valid ? chalkColors.green("VALID") : chalkColors.red("INVALID"),
      res.valid ? chalkColors.gray("All secrets resolved") : chalkColors.red(res.error || "Failed")
    ]);
  }

  console.log(table.toString());
  console.log("");

  return hasError ? 1 : 0;
}
