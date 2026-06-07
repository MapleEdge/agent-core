# Phase 2C: Authentication Middleware

API key authentication via Fastify `onRequest` hook, modeled after Parlant's `AuthorizationPolicy` abstraction and cognee's API key management.

## Vendor Source Inspected

### Parlant `AuthorizationPolicy` — abstract permission + rate limit contract

**File:** `vendor/providers/policy/parlant/src/parlant/api/authorization.py`

| Class/Function | Lines | Logic |
|---------------|-------|-------|
| `class Operation(Enum)` | 32-128 | Enumerates ~40 specific API operations (CREATE_AGENT, READ_SESSION, DELETE_GUIDELINE, etc.). Every API endpoint maps to one Operation. |
| `class AuthorizationException(Exception)` | 130-143 | Wraps `request`, `operation`, formatted message with headers. Used for both auth failures and rate limit violations. |
| `class RateLimitExceededException(AuthorizationException)` | 145-151 | Subclass with "Rate limit exceeded" prefix. |
| `class AuthorizationPolicy(ABC)` | 154-173 | Abstract base: `configure_app()`, `check_permission()`, `check_rate_limit()`, `authorize()`. The `authorize()` method calls both checks in sequence. |
| `async def authorize(self, request, operation)` | 164-169 | Calls `check_permission()` first, then `check_rate_limit()`. Raises `AuthorizationException` or `RateLimitExceededException`. |
| `class DevelopmentAuthorizationPolicy` | 176-202 | Dev mode: allows all origins (CORS `*`), always returns `True` for both checks. Property `name = "development"`. |
| `DevelopmentAuthorizationPolicy.check_permission()` | 195-197 | `return True` — allows all operations unconditionally. |
| `DevelopmentAuthorizationPolicy.check_rate_limit()` | 190-192 | `return True` — no rate limit enforcement. |
| `class ProductionAuthorizationPolicy` | 214-276 | Production mode: has `specific_limiters` dict and `default_limiter` (BasicRateLimiter). |
| `ProductionAuthorizationPolicy.check_permission()` | 259-270 | Whitelists 5 specific operations (READ_AGENT, CREATE_GUEST_SESSION, READ_SESSION, LIST_EVENTS, CREATE_CUSTOMER_EVENT) → `True`, all others → `False`. |
| `ProductionAuthorizationPolicy.configure_app()` | 237-252 | Adds CORS middleware with `allow_origins=["*"]`. Recommends subclass override for restrictive CORS. |

**Key design:** Parlant's auth is **operation-granular** — each endpoint has a named Operation, and `check_permission()` authorizes per-operation. No API key or token — it's a permission-whitelist model. The Production policy hardcodes which operations are public vs private.

### cognee API key management — per-user key store

**File:** `vendor/providers/knowledge/cognee/cognee/api/v1/api_keys/routers/get_api_key_management_router.py`

| Function | Lines | Logic |
|----------|-------|-------|
| `class ApiKeyCreationPayload(InDTO)` | 18-19 | Pydantic model: `name: Optional[str]`. |
| `get_api_keys_for_user(user=Depends(get_authenticated_user))` | 25-57 | `GET /api-keys`. Lists keys for the authenticated user. Masks key values when `HASH_API_KEY` is True (shows `"************"`). |
| `create_api_key_for_user(payload, user=Depends(get_authenticated_user))` | 59-83 | `POST /api-keys`. Creates a new API key via `create_api_key(user, name)`. Returns full key value on creation. Catches `ApiKeyCreationError`. |
| `delete_api_key_for_user(api_key_id, user=Depends(get_authenticated_user))` | 85-99 | `DELETE /api-keys/{api_key_id}`. Deletes by UUID. |

**Key design:** cognee stores API keys in a database (per-user CRUD). Keys are hashed for storage when `HASH_API_KEY=True`. Authentication is via FastAPI `Depends(get_authenticated_user)` which checks cookies, Bearer tokens, and API key headers.

### cognee `get_authenticated_user` — auth dependency

**File:** `vendor/providers/knowledge/cognee/cognee/modules/users/methods/get_authenticated_user.py` (referenced, not fully read)

Key behavior: FastAPI dependency injection that extracts user identity from:
1. Session cookie (if authenticated via login)
2. Bearer token (JWT)
3. X-Api-Key header (matched against stored API keys)

## agent-core `registerAuth()` — env-var single-key auth

**File:** `src/middleware/auth.ts`

| Function | Lines | Logic |
|----------|-------|-------|
| `isPublicRoute(url: string)` | 29-31 | Checks if URL starts with `/health` or `/docs`. Public routes skip auth entirely. |
| `registerAuth(app: FastifyInstance)` | 33-56 | Reads `AGENT_CORE_API_KEY` from env. If not set, returns immediately (dev mode — no auth). If set, registers `onRequest` hook. |
| `onRequest` hook | 42-55 | For non-public routes: extracts key from `x-api-key` header or `Authorization: Bearer` header. Compares against env var. Returns 401 with structured JSON `{error, code, message}` on mismatch. |
| `extractBearerToken(header)` | 59-65 | Parses `Authorization: Bearer <token>` format. Returns null if header is missing or malformed. |

## Function-Level Comparison

### Development mode: `registerAuth()` (no key) vs `DevelopmentAuthorizationPolicy`

| Dimension | Parlant `DevelopmentAuthorizationPolicy` | agent-core `registerAuth()` (no key) |
|-----------|----------------------------------------|--------------------------------------|
| **Trigger** | Configured at startup via DI container | `AGENT_CORE_API_KEY` env var absent |
| **check_permission()** | `return True` (line 197) | No hook registered — all requests pass |
| **check_rate_limit()** | `return True` (line 192) | Rate limiting is a separate middleware |
| **CORS** | `allow_origins=["*"]` (line 181) | CORS handled separately by `@fastify/cors` |
| **Code path** | Class instantiated, methods called on every request | `registerAuth()` returns early, zero per-request overhead |

**Verdict:** agent-core is more efficient — zero overhead in dev mode vs Parlant's no-op method calls.

### Production mode: `registerAuth()` (key set) vs `ProductionAuthorizationPolicy`

| Dimension | Parlant `ProductionAuthorizationPolicy` | cognee API key auth | agent-core `registerAuth()` |
|-----------|---------------------------------------|---------------------|---------------------------|
| **Auth model** | Operation whitelist (5 ops public, rest denied) | Per-user API keys stored in DB, checked per-request | Single env-var API key, checked per-request |
| **Key storage** | No keys — hardcoded operation whitelist | Database with CRUD + hashing | Environment variable |
| **Key rotation** | N/A | Create/delete API keys via REST | Restart with new env var |
| **Multi-tenancy** | No user identity in auth | Full per-user isolation | Single-tenant |
| **Token formats** | None | Cookie + JWT + X-Api-Key | `x-api-key` header + `Authorization: Bearer` |
| **Public routes** | `/docs`, `/redoc`, `/openapi.json` exempt from tracing but auth-checked | Auth via `Depends()` — no global exemptions | `/health`, `/docs/*` exempted at middleware level |
| **Error response** | `AuthorizationException` → caught by middleware → HTTP response | FastAPI returns 401/403 | Structured JSON: `{error, code: "AUTH_INVALID_KEY", message}` |
| **Per-operation granularity** | Yes (40 operations) | No (user-level) | No (global key) |

### Error response comparison

| Vendor | Error format | Machine-readable? |
|--------|-------------|-------------------|
| Parlant | `AuthorizationException(request, operation)` → middleware converts to HTTP status | No — exception message includes raw headers |
| cognee | FastAPI returns `401` with generic message | Minimal |
| agent-core | `{error: "Unauthorized", code: "AUTH_INVALID_KEY", message: "Missing or invalid API key..."}` | **Yes** — `.code` field for programmatic handling |

## Competitive Assessment

| Criterion | Parlant | cognee | agent-core | Winner |
|-----------|---------|--------|------------|--------|
| Dev mode efficiency | No-op methods (overhead) | N/A | Zero hook overhead | agent-core |
| Production auth model | Operation whitelist | Per-user API keys + CRUD | Single env-var key | cognee (most mature) |
| Multi-tenancy | No | Yes (per-user) | No (single-tenant) | cognee |
| Error response structure | Exception with headers | Generic 401 | Structured JSON with code | agent-core |
| Key rotation | N/A | REST API | Env var restart | cognee |
| Bearer + header support | No | Yes (3 methods) | Yes (2 methods) | cognee |
| Public route exemption | Auth-checked with exempt operation | No global exemptions | Middleware-level exemption | agent-core/Parlant |
| Separation of concerns | Auth + rate limit in single policy | Auth separate from rate limit | Auth and rate limit are separate middlewares | agent-core + cognee |

**Overall verdict:** agent-core's auth is appropriate for Phase 2 (single-tenant service). It is architecturally cleaner than Parlant's monolithic AuthorizationPolicy (which bundles auth + rate limiting + CORS) and simpler than cognee's full per-user key store (which is needed for multi-tenancy but overkill for Phase 2). The structured JSON error response is superior to both vendors. The main gap vs cognee is per-user key management and multi-tenancy — these are Phase 3+ features.
