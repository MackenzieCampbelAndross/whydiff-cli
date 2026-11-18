import { describe, it, expect } from "vitest";
import { normalizeHeaders, parseRevisionRange, GitError, runGit } from "@whydiff/core";

describe("Security: Input Validation and Sanitization", () => {
  it("redacts sensitive authentication and session headers automatically", () => {
    const rawHeaders = {
      "Authorization": "Bearer super_secret_token_12345",
      "Proxy-Authorization": "Basic dXNlcjpwYXNz",
      "Cookie": "session_id=abcdef987654",
      "Set-Cookie": "auth=valid; Secure; HttpOnly",
      "X-Api-Key": "my-secret-api-key",
      "Content-Type": "application/json"
    };

    const normalized = normalizeHeaders(rawHeaders, { redactSensitive: true });

    expect(normalized["authorization"]).toBe("[REDACTED]");
    expect(normalized["proxy-authorization"]).toBe("[REDACTED]");
    expect(normalized["cookie"]).toBe("[REDACTED]");
    expect(normalized["set-cookie"]).toBe("[REDACTED]");
    expect(normalized["x-api-key"]).toBe("[REDACTED]");
    expect(normalized["content-type"]).toBe("application/json");
  });

  it("safely rejects shell injection attempts in revision ranges without executing shell", () => {
    const maliciousInputs = [
      "main; rm -rf /",
      "main && whoami",
      "main | cat /etc/passwd",
      "`touch /tmp/pwned`..HEAD",
      "$(reboot)..HEAD"
    ];

    for (const input of maliciousInputs) {
      expect(() => parseRevisionRange(input)).toThrowError(GitError);
    }
  });

  it("ensures Git command execution uses safe argument arrays preventing injection", async () => {
    // Attempting to pass shell metacharacters as an argument should be treated as literal argument to git
    await expect(
      runGit(["rev-parse", "--verify", "HEAD; echo pwned"], process.cwd())
    ).rejects.toThrow();
  });
});
