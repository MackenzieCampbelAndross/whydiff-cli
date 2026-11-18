import Fastify, { FastifyInstance } from "fastify";

export interface MockAppOptions {
  usersResponse?: unknown;
  healthResponse?: unknown;
  statusCode?: number;
  headers?: Record<string, string>;
  shouldThrow?: boolean;
}

export function createMockFastifyApp(options: MockAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async (_req, reply) => {
    return options.healthResponse ?? { status: "ok" };
  });

  app.get("/users/:id", async (_req, reply) => {
    if (options.shouldThrow) {
      reply.status(500);
      throw new Error("Simulated database failure");
    }

    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        reply.header(k, v);
      }
    }

    if (options.statusCode) {
      reply.status(options.statusCode);
    }

    return options.usersResponse ?? {
      id: "123",
      name: "Alice",
      email: "alice@example.com",
      role: "admin"
    };
  });

  return app;
}
