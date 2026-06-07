/**
 * Sliding-window rate limiter middleware.
 *
 * Reference: Parlant — BasicRateLimiter + MovingWindowRateLimiter
 *   vendor/providers/policy/parlant/src/parlant/api/authorization.py:279-331
 *
 * Parlant uses the `limits` library with per-operation rate configs and
 * a composite key of IP + operation. Their approach:
 *   - rate_limit_item_per_operation: dict mapping Operation → RateLimitItem
 *   - Default fallback: 100 req/min
 *   - IP extraction: x-forwarded-for → x-real-ip → cf-connecting-ip → client.host
 *
 * Our implementation:
 *   - Pure in-memory sliding window (no external dependency). Parlant uses
 *     the `limits` library which wraps Redis/memcached; we keep it zero-dep
 *     and in-process for Phase 2 (single-instance service).
 *   - Same IP extraction chain as Parlant (authorization.py:318-331).
 *   - Configurable via RATE_LIMIT_RPM env var (default: 120 req/min).
 *   - Returns standard `Retry-After` header on 429, which Parlant does not.
 *   - Disabled when RATE_LIMIT_RPM=0 (development mode).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

interface WindowEntry {
  timestamps: number[];
}

const windows = new Map<string, WindowEntry>();
const WINDOW_MS = 60_000;
const CLEANUP_INTERVAL_MS = 60_000;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function getClientIp(request: FastifyRequest): string {
  // Same extraction chain as Parlant's BasicRateLimiter._get_client_ip
  // (authorization.py:318-331)
  const xff = request.headers["x-forwarded-for"];
  if (xff) {
    const first = (Array.isArray(xff) ? xff[0] : xff).split(",")[0].trim();
    if (first) return first;
  }
  const xri = request.headers["x-real-ip"];
  if (xri) return (Array.isArray(xri) ? xri[0] : xri).trim();
  const cf = request.headers["cf-connecting-ip"];
  if (cf) return (Array.isArray(cf) ? cf[0] : cf).trim();
  return request.ip;
}

function slidingWindowCheck(key: string, maxRequests: number, now: number): boolean {
  let entry = windows.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    windows.set(key, entry);
  }
  const cutoff = now - WINDOW_MS;
  entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);
  if (entry.timestamps.length >= maxRequests) {
    return false;
  }
  entry.timestamps.push(now);
  return true;
}

function cleanup(): void {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, entry] of windows) {
    entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);
    if (entry.timestamps.length === 0) windows.delete(key);
  }
}

export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  const rpm = Number(process.env.RATE_LIMIT_RPM ?? 120);

  if (rpm <= 0) return;

  if (!cleanupTimer) {
    cleanupTimer = setInterval(cleanup, CLEANUP_INTERVAL_MS);
    if (cleanupTimer.unref) cleanupTimer.unref();
  }

  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    // Public routes exempt from rate limiting
    if (request.url === "/health" || request.url.startsWith("/docs")) return;

    const ip = getClientIp(request);
    const now = Date.now();

    if (!slidingWindowCheck(ip, rpm, now)) {
      const retryAfter = Math.ceil(WINDOW_MS / 1000);
      reply
        .code(429)
        .header("Retry-After", retryAfter)
        .send({
          error: "Too Many Requests",
          code: "RATE_LIMIT_EXCEEDED",
          message: `Rate limit of ${rpm} requests per minute exceeded`,
          retry_after_seconds: retryAfter,
        });
    }
  });
}

/** Reset rate limit state (for testing). */
export function resetRateLimitState(): void {
  windows.clear();
}
