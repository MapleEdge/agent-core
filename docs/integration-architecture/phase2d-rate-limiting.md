# Phase 2D: Rate Limiting Middleware

In-memory sliding-window rate limiter, modeled after Parlant's `BasicRateLimiter`.

## Vendor Source Inspected

### Parlant `BasicRateLimiter` — `limits` library wrapper

**File:** `vendor/providers/policy/parlant/src/parlant/api/authorization.py:279-331`

| Class/Function | Lines | Logic |
|---------------|-------|-------|
| `class RateLimiter(ABC)` | 205-211 | Abstract base with single method `check(request, operation) -> bool`. |
| `class BasicRateLimiter(RateLimiter)` | 279-331 | Production rate limiter using the `limits` Python library. |
| `__init__(self, rate_limit_item_per_operation, storage, limiter_type)` | 280-290 | Accepts per-operation rate configs, memory storage (default), and limiter algorithm type. Default limiter: `MovingWindowRateLimiter`. Default fallback: `RateLimitItemPerMinute(100)`. |
| `rate_limit_item_per_operation` dict | 226-234 | Maps specific Operations to their limits. Example configs: `READ_AGENT: 30/min`, `CREATE_GUEST_SESSION: 10/min`, `READ_SESSION: 30/min`, `LIST_EVENTS: 240/min`. |
| `async def check(self, request, operation)` | 292-300 | Looks up operation-specific limit; falls back to `_default_rate_limit_item` (100/min). Calls `self._limiter.hit(item, key)`. |
| `_build_key(self, request, operation)` | 302-316 | Builds composite key: `"IP={ip}--OP={operation.value}"`. Raises `AuthorizationException` if no IP found. |
| `_get_client_ip(request)` (static) | 318-331 | IP extraction chain: `x-forwarded-for` (first in comma-separated list) → `x-real-ip` → `cf-connecting-ip` → `request.client.host`. |

**Key design decisions:**
- Per-operation rate limits (different limits for different operations)
- Composite key: IP + operation (so rate limits are operation-specific per IP)
- External dependency: `limits` library (wraps Redis/memcached for production; `MemoryStorage` for dev)
- Algorithm: `MovingWindowRateLimiter` (precise sliding window)
- No `Retry-After` header in response
- Rate limit check is bundled inside `AuthorizationPolicy.authorize()` (called after permission check)

### Parlant `ProductionAuthorizationPolicy.check_rate_limit()`

**File:** `vendor/providers/policy/parlant/src/parlant/api/authorization.py:272-276`

```python
async def check_rate_limit(self, request: Request, operation: Operation) -> bool:
    if specific_limiter := self.specific_limiters.get(operation):
        return await specific_limiter(request, operation)
    return await self.default_limiter.check(request, operation)
```

Two-tier: operation-specific custom limiters → default BasicRateLimiter.

### cognee — no rate limiting

cognee does not implement rate limiting at the application level. The `client.py` file has no rate limit middleware. LLM calls have their own rate limiting (`LLM_RATE_LIMIT_ENABLED`, `LLM_RATE_LIMIT_REQUESTS`, `LLM_RATE_LIMIT_INTERVAL`) but this is for outbound LLM API calls, not inbound HTTP requests.

## agent-core `registerRateLimit()` — pure sliding window

**File:** `src/middleware/rateLimit.ts`

| Function | Lines | Logic |
|----------|-------|-------|
| `interface WindowEntry` | 25-27 | `{ timestamps: number[] }` — stores request timestamps for each key. |
| `const windows = new Map<string, WindowEntry>()` | 29 | In-memory store. Module-level singleton. |
| `const WINDOW_MS = 60_000` | 30 | 1-minute sliding window. |
| `getClientIp(request: FastifyRequest)` | 35-48 | IP extraction chain matching Parlant exactly: `x-forwarded-for` → `x-real-ip` → `cf-connecting-ip` → `request.ip`. |
| `slidingWindowCheck(key, maxRequests, now)` | 50-63 | Core algorithm: filter expired timestamps, check count vs limit, append if allowed. Returns boolean. |
| `cleanup()` | 65-71 | Periodic cleanup: removes expired timestamps and empty entries. Runs every 60s via `setInterval` with `.unref()`. |
| `registerRateLimit(app: FastifyInstance)` | 73-102 | Reads `RATE_LIMIT_RPM` from env (default: 120). If ≤0, returns (disabled). Registers `onRequest` hook. Exempts `/health` and `/docs*`. |
| `onRequest` hook body | 83-101 | Extracts IP, checks sliding window. On limit exceeded: returns 429 with `Retry-After` header and structured JSON body. |
| `resetRateLimitState()` | 106-108 | Test utility: clears the windows map. |

## Function-Level Comparison

### IP extraction: `getClientIp()` vs `_get_client_ip()`

| Step | Parlant `_get_client_ip()` (318-331) | agent-core `getClientIp()` (35-48) |
|------|--------------------------------------|-------------------------------------|
| 1. x-forwarded-for | `xff.split(",")[0].strip()` | `(Array.isArray(xff) ? xff[0] : xff).split(",")[0].trim()` |
| 2. x-real-ip | `xri.strip()` | `(Array.isArray(xri) ? xri[0] : xri).trim()` |
| 3. cf-connecting-ip | `cf.strip()` | `(Array.isArray(cf) ? cf[0] : cf).trim()` |
| 4. Fallback | `request.client.host if request.client else None` | `request.ip` (Fastify always has this) |
| 5. No IP handling | Raises `AuthorizationException` | Falls through to `request.ip` (always defined) |

**Verdict:** Functionally identical extraction chain. agent-core handles the Fastify header array type (headers can be `string | string[]`) which Parlant doesn't need in Python. agent-core never raises on missing IP — `request.ip` is always available.

### Rate check: `slidingWindowCheck()` vs `_limiter.hit()`

| Dimension | Parlant `_limiter.hit(item, key)` | agent-core `slidingWindowCheck(key, maxRequests, now)` |
|-----------|----------------------------------|-------------------------------------------------------|
| **Algorithm** | `MovingWindowRateLimiter` from `limits` library | Pure sliding window: filter expired, count, append |
| **Storage** | `MemoryStorage()` (default) or Redis | `Map<string, WindowEntry>` (in-process) |
| **Precision** | Library-managed window granularity | Exact per-request timestamps |
| **Memory cleanup** | Library-managed | Periodic `setInterval` cleanup every 60s |
| **External dependency** | `limits` library + `MemoryStorage` | Zero dependencies |
| **Scalability** | Can swap to Redis for multi-instance | In-process only (single instance) |

**Verdict:** Functionally equivalent for single-instance deployments. Parlant's `limits` library adds Redis support for multi-instance; agent-core's zero-dep approach is appropriate for Phase 2 single-instance.

### Key construction: IP-only vs IP+operation

| Dimension | Parlant | agent-core |
|-----------|---------|------------|
| **Key format** | `"IP={ip}--OP={operation.value}"` | `ip` (IP only) |
| **Per-operation limits** | Yes (different limits per Operation enum value) | No (global RPM) |
| **Granularity** | Operation-specific: READ_AGENT=30/min, LIST_EVENTS=240/min | Global: all routes share one limit (default 120/min) |

**Verdict:** Parlant's per-operation limiting is more granular. agent-core uses a simpler global limit that's appropriate for Phase 2. Per-route limits are a Phase 3 enhancement.

### Response on limit exceeded

| Dimension | Parlant | agent-core |
|-----------|---------|------------|
| **HTTP status** | Not directly — `RateLimitExceededException` raised, middleware converts to HTTP | Direct 429 |
| **Retry-After header** | Not sent | `Retry-After: 60` sent (RFC 6585 compliant) |
| **Response body** | Exception message (unstructured) | `{error, code: "RATE_LIMIT_EXCEEDED", message, retry_after_seconds}` |
| **Machine-readable** | No | Yes |

**Verdict:** agent-core's response is superior — RFC 6585 `Retry-After` header and structured JSON body.

### Dev mode / disabled

| Dimension | Parlant `DevelopmentAuthorizationPolicy` | agent-core `RATE_LIMIT_RPM=0` |
|-----------|----------------------------------------|-------------------------------|
| **Trigger** | Class selected at startup | Env var ≤ 0 |
| **Overhead** | `check_rate_limit()` called → `return True` | `registerRateLimit()` returns early, no hook registered |
| **Code path** | Method call per request | Zero per-request overhead |

**Verdict:** agent-core is more efficient — no hook overhead when disabled.

## Competitive Assessment

| Criterion | Parlant | cognee | agent-core | Winner |
|-----------|---------|--------|------------|--------|
| Rate limit algorithm | MovingWindowRateLimiter (library) | None | Pure sliding window | Parlant (library-backed) / agent-core (zero-dep) — tie for single-instance |
| Per-operation limits | Yes (Operation enum) | N/A | No (global RPM) | Parlant |
| IP extraction | 4-step chain | N/A | 4-step chain (identical) | Parity |
| Retry-After header | No | N/A | Yes (RFC 6585) | agent-core |
| Structured error body | No (exception message) | N/A | Yes (JSON with code) | agent-core |
| Multi-instance support | Redis via `limits` | N/A | In-process only | Parlant |
| Dev mode overhead | No-op method call | N/A | Zero (no hook) | agent-core |
| External dependencies | `limits` library | N/A | None | agent-core |
| Test utilities | None | N/A | `resetRateLimitState()` | agent-core |

**Overall verdict:** agent-core's rate limiter is competitive for a single-instance service. It matches Parlant's core algorithm (sliding window) and IP extraction chain, while adding RFC-compliant `Retry-After` headers, structured error responses, zero dev-mode overhead, and a test utility. The main gap vs Parlant is per-operation granularity and Redis-backed multi-instance support — both are Phase 3+ features.
