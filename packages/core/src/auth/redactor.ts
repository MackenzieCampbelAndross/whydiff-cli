const DEFAULT_SENSITIVE_FIELD_NAMES = new Set([
  "password",
  "secret",
  "token",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "api_key",
  "client_secret",
  "privatekey",
  "private_key",
  "ssn",
  "creditcard"
]);

export function redactSensitiveData(
  value: unknown,
  customSensitiveFields: string[] = []
): unknown {
  const sensitiveSet = new Set([
    ...Array.from(DEFAULT_SENSITIVE_FIELD_NAMES),
    ...customSensitiveFields.map(f => f.toLowerCase())
  ]);

  function sanitize(val: unknown): unknown {
    if (val === null || val === undefined) return val;
    if (typeof val !== "object") return val;

    if (Array.isArray(val)) {
      return val.map(sanitize);
    }

    const obj = val as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(obj)) {
      const lowerKey = k.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (sensitiveSet.has(lowerKey) || Array.from(sensitiveSet).some(s => lowerKey.includes(s))) {
        sanitized[k] = "[REDACTED]";
      } else {
        sanitized[k] = sanitize(v);
      }
    }

    return sanitized;
  }

  return sanitize(value);
}

export function redactSensitiveUrl(urlStr: string): string {
  try {
    const dummyBase = "http://localhost";
    const parsed = new URL(urlStr, dummyBase);

    for (const [paramName] of parsed.searchParams.entries()) {
      const lower = paramName.toLowerCase();
      if (
        lower.includes("key") ||
        lower.includes("token") ||
        lower.includes("secret") ||
        lower.includes("auth") ||
        lower.includes("password")
      ) {
        parsed.searchParams.set(paramName, "[REDACTED]");
      }
    }

    if (urlStr.startsWith("/")) {
      return parsed.pathname + parsed.search;
    }
    return parsed.toString();
  } catch {
    return urlStr;
  }
}

export function redactErrorString(str: string): string {
  // Redact bearer tokens or basic auth strings
  return str
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [REDACTED]")
    .replace(/(api[_-]?key=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/(token=)[^&\s]+/gi, "$1[REDACTED]");
}
