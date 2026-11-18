import { AuthProfile } from "./types.js";
import { resolveAuthProfile } from "./resolver.js";
import { HttpProbe } from "../probes/types.js";

export function injectAuthIntoProbe(
  probe: HttpProbe,
  profile?: AuthProfile,
  env: Record<string, string | undefined> = process.env
): HttpProbe {
  if (!profile) return probe;

  const resolved = resolveAuthProfile(profile, env);
  const headers = { ...(probe.headers || {}) };
  const query = { ...(probe.query || {}) };

  switch (resolved.type) {
    case "bearer":
      headers["authorization"] = `Bearer ${resolved.token}`;
      break;

    case "apiKey":
      if (resolved.in === "query") {
        query[resolved.name] = resolved.value;
      } else {
        headers[resolved.name.toLowerCase()] = resolved.value;
      }
      break;

    case "basic": {
      const encoded = Buffer.from(`${resolved.username}:${resolved.password}`).toString("base64");
      headers["authorization"] = `Basic ${encoded}`;
      break;
    }

    case "custom":
      for (const [k, v] of Object.entries(resolved.headers)) {
        headers[k.toLowerCase()] = v;
      }
      break;
  }

  return {
    ...probe,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    query: Object.keys(query).length > 0 ? query : undefined
  };
}

export const injectAuth = injectAuthIntoProbe;
