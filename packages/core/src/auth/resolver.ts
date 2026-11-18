import { AuthProfile } from "./types.js";

export function resolveSecretString(val: string, env: Record<string, string | undefined> = process.env): string {
  const trimmed = val.trim();

  // Match ${VAR_NAME}
  const matchBraces = trimmed.match(/^\$\{([a-zA-Z0-9_]+)\}$/);
  if (matchBraces && matchBraces[1]) {
    const varName = matchBraces[1];
    const envVal = env[varName];
    if (envVal === undefined) {
      throw new Error(`Referenced environment variable '${varName}' is not set in the current environment`);
    }
    return envVal;
  }

  // Match env:VAR_NAME
  if (trimmed.startsWith("env:")) {
    const varName = trimmed.substring(4);
    const envVal = env[varName];
    if (envVal === undefined) {
      throw new Error(`Referenced environment variable '${varName}' is not set in the current environment`);
    }
    return envVal;
  }

  return val;
}

export function resolveAuthProfile(profile: AuthProfile, env: Record<string, string | undefined> = process.env): AuthProfile {
  switch (profile.type) {
    case "bearer":
      return {
        type: "bearer",
        token: resolveSecretString(profile.token, env)
      };

    case "apiKey":
      return {
        type: "apiKey",
        name: profile.name,
        in: profile.in,
        value: resolveSecretString(profile.value, env)
      };

    case "basic":
      return {
        type: "basic",
        username: resolveSecretString(profile.username, env),
        password: resolveSecretString(profile.password, env)
      };

    case "custom": {
      const resolvedHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(profile.headers)) {
        resolvedHeaders[k] = resolveSecretString(v, env);
      }
      return {
        type: "custom",
        headers: resolvedHeaders
      };
    }
  }
}
