import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // 1. Unchanged endpoint
  app.get("/health", async () => {
    return { status: "ok" };
  });

  // 2. Will have 'email' removed in candidate
  app.get("/users/:id", async (request) => {
    const { id } = request.params as { id: string };
    return {
      id,
      name: "Alice",
      email: "alice@example.com",
      role: "admin"
    };
  });

  // 3. Will have 'mode' value altered in candidate
  app.get("/config", async () => {
    return {
      version: "1.0.0",
      mode: "standard"
    };
  });

  // 4. Will have status code changed from 201 to 200 in candidate
  app.post("/orders", async (_request, reply) => {
    return reply.status(201).send({
      id: "ord_99",
      status: "created"
    });
  });

  // 5. Will have cache-control header changed in candidate
  app.get("/content", async (_request, reply) => {
    return reply
      .header("cache-control", "public, max-age=3600")
      .header("content-type", "application/json")
      .send({ content: "static-data" });
  });

  // 6. Will fail with 500 error in candidate
  app.get("/billing/summary", async () => {
    return {
      total: 150.0,
      currency: "USD"
    };
  });

  // 7. Secure profile (requires Bearer token)
  app.get("/secure/profile", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    return { user: "alice", role: "admin" };
  });

  return app;
}
