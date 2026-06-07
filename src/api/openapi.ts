/**
 * OpenAPI spec and Swagger UI registration.
 *
 * Reference: Parlant — FastAPI auto-generates OpenAPI from Pydantic models
 *   vendor/providers/policy/parlant/src/parlant/api/app.py:128-132
 *   Parlant's FastAPI(title="Parlant API", description=..., version=VERSION)
 *
 * Reference: cognee — FastAPI with custom_openapi override
 *   vendor/providers/knowledge/cognee/cognee/api/client.py:14
 *   Uses `fastapi.openapi.utils.get_openapi` for customization.
 *
 * Our approach:
 *   - Fastify has no built-in OpenAPI generation. We use @fastify/swagger
 *     to generate the spec from route schemas at runtime.
 *   - @fastify/swagger-ui serves the interactive docs at /docs.
 *   - This is functionally equivalent to Parlant's /docs and cognee's
 *     /docs endpoints, with additional API versioning in the info block.
 */

import type { FastifyInstance } from "fastify";

export async function registerOpenAPI(app: FastifyInstance): Promise<void> {
  const swagger = await import("@fastify/swagger");
  const swaggerUi = await import("@fastify/swagger-ui");

  await app.register(swagger.default, {
    openapi: {
      info: {
        title: "agent-core API",
        description:
          "Memory, context, actions, rules, traces, and mock platform endpoints " +
          "for an agent-aware development platform.",
        version: "0.1.0",
      },
      servers: [{ url: `http://localhost:${process.env.PORT ?? 3210}` }],
      tags: [
        { name: "memory", description: "Memory storage and retrieval (mem0 + claude-mem patterns)" },
        { name: "context", description: "Hierarchical context tree per repository" },
        { name: "sessions", description: "Session lifecycle and event tracking" },
        { name: "traces", description: "Tool-call and skill-run execution traces" },
        { name: "actions", description: "Action registry, validation, and execution pipeline" },
        { name: "audits", description: "Action audit records — durable execution history" },
        { name: "rules", description: "Letta-style tool rule sequences and validation" },
        { name: "classify", description: "Task classification (keyword or LLM)" },
        { name: "policy", description: "Parlant-style policy rule matching" },
        { name: "providers", description: "Provider capability matrix" },
        { name: "mock-platform", description: "Mock platform endpoints for testing" },
      ],
    },
  });

  await app.register(swaggerUi.default, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
  });
}
