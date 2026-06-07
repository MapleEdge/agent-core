/**
 * API key authentication middleware.
 *
 * Reference: Parlant — AuthorizationPolicy + ProductionAuthorizationPolicy
 *   vendor/providers/policy/parlant/src/parlant/api/authorization.py:154-270
 *   Parlant separates permission checks (check_permission) from rate limiting
 *   (check_rate_limit) via an abstract AuthorizationPolicy.
 *
 * Reference: cognee — FastAPI Depends(get_authenticated_user) + API key CRUD
 *   vendor/providers/knowledge/cognee/cognee/api/v1/api_keys/routers/get_api_key_management_router.py
 *   Cognee stores API keys per-user and authenticates via dependency injection.
 *
 * Our approach:
 *   - Fastify onRequest hook checks the `x-api-key` or `Authorization: Bearer`
 *     header against AGENT_CORE_API_KEY env var. This is simpler than cognee's
 *     per-user key store but appropriate for Phase 2 (single-tenant service).
 *   - When AGENT_CORE_API_KEY is not set, auth is disabled (development mode),
 *     matching Parlant's DevelopmentAuthorizationPolicy pattern.
 *   - Health and docs endpoints are always public, matching Parlant's exempt
 *     operation list.
 *   - Returns structured JSON error body with `code` field, unlike Parlant
 *     which raises Python exceptions caught by middleware.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

const PUBLIC_PREFIXES = ["/health", "/docs", "/docs/"];

function isPublicRoute(url: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => url === prefix || url.startsWith(prefix));
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  const apiKey = process.env.AGENT_CORE_API_KEY;

  if (!apiKey) {
    // Development mode — no auth enforcement, like Parlant's
    // DevelopmentAuthorizationPolicy (authorization.py:176-202).
    return;
  }

  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    if (isPublicRoute(request.url)) return;

    const provided =
      (request.headers["x-api-key"] as string) ??
      extractBearerToken(request.headers.authorization as string | undefined);

    if (!provided || provided !== apiKey) {
      reply.code(401).send({
        error: "Unauthorized",
        code: "AUTH_INVALID_KEY",
        message: "Missing or invalid API key. Provide via x-api-key header or Authorization: Bearer.",
      });
    }
  });
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const parts = header.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
    return parts[1];
  }
  return null;
}
