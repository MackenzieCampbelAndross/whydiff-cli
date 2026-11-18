import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // 1. Unchanged endpoint
  app.get("/health", async () => {
    return { status: "ok" };
  });

  // 2. REGRESSION: 'email' field removed (Breaking)
  app.get("/users/:id", async (request) => {
    const { id } = request.params as { id: string };
    return {
      id,
      name: "Alice",
      role: "admin"
    };
  });

  // 3. REGRESSION: 'mode' value changed from 'standard' to 'legacy' (Changed)
  app.get("/config", async () => {
    return {
      version: "1.0.0",
      mode: "legacy"
    };
  });

  // 4. REGRESSION: status code changed from 201 to 200 (Risky)
  app.post("/orders", async (_request, reply) => {
    return reply.status(200).send({
      id: "ord_99",
      status: "created"
    });
  });

  // 5. REGRESSION: cache-control header changed from 'public, max-age=3600' to 'no-store' (Changed)
  app.get("/content", async (_request, reply) => {
    return reply
      .header("cache-control", "no-store")
      .header("content-type", "application/json")
      .send({ content: "static-data" });
  });

  // 6. REGRESSION: Uncaught error causes HTTP 500 (Breaking)
  app.get("/billing/summary", async (_request, reply) => {
    reply.status(500);
    throw new Error("Billing database connection error");
  });

  // 7. Secure profile (requires API Key header in candidate)
  app.get("/secure/profile", async (request, reply) => {
    const apiKey = request.headers["x-api-key"];
    if (!apiKey || apiKey !== "secret-key-123") {
      return reply.status(401).send({ error: "API key required" });
    }
    return { user: "alice", role: "admin" };
  });

  return app;
}
