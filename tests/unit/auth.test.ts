import { describe, it, expect } from "vitest";
import {
  resolveSecretString,
  resolveAuthProfile,
  injectAuth,
  redactSensitiveData,
  AuthProfile
} from "@whydiff/core";

describe("Unit: Authentication & Authorization", () => {
  describe("Secret Resolution", () => {
    const mockEnv = {
      API_TOKEN: "secret-token-abc",
      API_KEY: "secret-key-xyz",
      USER_PASS: "hunter2"
    };

    it("resolves ${VAR} environment references", () => {
      const res = resolveSecretString("${API_TOKEN}", mockEnv);
      expect(res).toBe("secret-token-abc");
    });

    it("resolves env:VAR environment references", () => {
      const res = resolveSecretString("env:API_KEY", mockEnv);
      expect(res).toBe("secret-key-xyz");
    });

    it("leaves literal strings untouched", () => {
      const res = resolveSecretString("literal-secret", mockEnv);
      expect(res).toBe("literal-secret");
    });

    it("throws clear error when referenced environment variable is unset", () => {
      expect(() => resolveSecretString("${MISSING_VAR}", mockEnv)).toThrow(
        "Referenced environment variable 'MISSING_VAR' is not set"
      );
      expect(() => resolveSecretString("env:UNDEFINED_KEY", mockEnv)).toThrow(
        "Referenced environment variable 'UNDEFINED_KEY' is not set"
      );
    });

    it("resolves all profile variants", () => {
      const bearer: AuthProfile = { type: "bearer", token: "${API_TOKEN}" };
      const resolvedBearer = resolveAuthProfile(bearer, mockEnv);
      expect(resolvedBearer.type).toBe("bearer");
      if (resolvedBearer.type === "bearer") {
        expect(resolvedBearer.token).toBe("secret-token-abc");
      }

      const basic: AuthProfile = { type: "basic", username: "admin", password: "${USER_PASS}" };
      const resolvedBasic = resolveAuthProfile(basic, mockEnv);
      expect(resolvedBasic.type).toBe("basic");
      if (resolvedBasic.type === "basic") {
        expect(resolvedBasic.password).toBe("hunter2");
      }
    });
  });

  describe("Auth Injection", () => {
    const dummyProbe = { id: "p1", name: "test", method: "GET" as const, path: "/test" };

    it("injects Bearer authorization header", () => {
      const profile: AuthProfile = { type: "bearer", token: "tok-123" };
      const injected = injectAuth({ ...dummyProbe, headers: { "accept": "application/json" } }, profile);

      expect(injected.headers?.["authorization"]).toBe("Bearer tok-123");
      expect(injected.headers?.["accept"]).toBe("application/json");
    });

    it("injects API key in header", () => {
      const profile: AuthProfile = { type: "apiKey", name: "x-api-key", value: "key-456", in: "header" };
      const injected = injectAuth({ ...dummyProbe, headers: {} }, profile);

      expect(injected.headers?.["x-api-key"]).toBe("key-456");
    });

    it("injects API key in query parameters", () => {
      const profile: AuthProfile = { type: "apiKey", name: "api_key", value: "key-456", in: "query" };
      const injected = injectAuth({ ...dummyProbe, query: { "sort": "asc" } }, profile);

      expect(injected.query?.["api_key"]).toBe("key-456");
      expect(injected.query?.["sort"]).toBe("asc");
    });

    it("injects Basic authentication with Base64 encoding", () => {
      const profile: AuthProfile = { type: "basic", username: "alice", password: "secret" };
      const injected = injectAuth({ ...dummyProbe }, profile);

      const expectedBase64 = Buffer.from("alice:secret").toString("base64");
      expect(injected.headers?.["authorization"]).toBe(`Basic ${expectedBase64}`);
    });

    it("injects custom authentication headers", () => {
      const profile: AuthProfile = {
        type: "custom",
        headers: { "x-tenant-id": "t-100", "x-signature": "sig-abc" }
      };
      const injected = injectAuth({ ...dummyProbe, headers: { "user-agent": "test" } }, profile);

      expect(injected.headers?.["x-tenant-id"]).toBe("t-100");
      expect(injected.headers?.["x-signature"]).toBe("sig-abc");
      expect(injected.headers?.["user-agent"]).toBe("test");
    });
  });

  describe("Secret Redaction", () => {
    it("redacts sensitive keys from objects and nested arrays", () => {
      const input = {
        id: "123",
        username: "admin",
        password: "SuperSecretPassword123",
        auth: {
          token: "bearer-xyz",
          apiKey: "my-key"
        },
        items: [
          { name: "item1", secret: "secret-val" },
          { name: "item2", publicInfo: "safe" }
        ]
      };

      const sanitized = redactSensitiveData(input) as typeof input;

      expect(sanitized.id).toBe("123");
      expect(sanitized.username).toBe("admin");
      expect(sanitized.password).toBe("[REDACTED]");
      expect(sanitized.auth.token).toBe("[REDACTED]");
      expect(sanitized.auth.apiKey).toBe("[REDACTED]");
      expect(sanitized.items[0]!.secret).toBe("[REDACTED]");
      expect(sanitized.items[1]!.publicInfo).toBe("safe");
    });

    it("redacts custom sensitive field names", () => {
      const input = {
        sessionId: "sess_secret_777",
        name: "test"
      };

      const sanitized = redactSensitiveData(input, ["sessionId"]) as typeof input;
      expect(sanitized.sessionId).toBe("[REDACTED]");
      expect(sanitized.name).toBe("test");
    });
  });
});
