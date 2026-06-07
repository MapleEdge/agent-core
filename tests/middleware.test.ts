import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { registerAuth } from "../src/middleware/auth.js";
import { registerRateLimit, resetRateLimitState } from "../src/middleware/rateLimit.js";

describe("Auth Middleware", () => {
  describe("when AGENT_CORE_API_KEY is set", () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      process.env.AGENT_CORE_API_KEY = "test-secret-key";
      app = Fastify();
      await registerAuth(app);
      app.get("/health", async () => ({ status: "ok" }));
      app.get("/test", async () => ({ data: "secret" }));
      await app.ready();
    });

    afterAll(async () => {
      delete process.env.AGENT_CORE_API_KEY;
      await app.close();
    });

    it("allows health endpoint without auth", async () => {
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
    });

    it("rejects requests without API key", async () => {
      const res = await app.inject({ method: "GET", url: "/test" });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("AUTH_INVALID_KEY");
    });

    it("accepts requests with x-api-key header", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/test",
        headers: { "x-api-key": "test-secret-key" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toBe("secret");
    });

    it("accepts requests with Bearer token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/test",
        headers: { authorization: "Bearer test-secret-key" },
      });
      expect(res.statusCode).toBe(200);
    });

    it("rejects wrong API key", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/test",
        headers: { "x-api-key": "wrong-key" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("when AGENT_CORE_API_KEY is not set", () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      delete process.env.AGENT_CORE_API_KEY;
      app = Fastify();
      await registerAuth(app);
      app.get("/test", async () => ({ data: "open" }));
      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it("allows all requests when no key is configured (dev mode)", async () => {
      const res = await app.inject({ method: "GET", url: "/test" });
      expect(res.statusCode).toBe(200);
    });
  });
});

describe("Rate Limit Middleware", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.RATE_LIMIT_RPM = "5";
    app = Fastify();
    await registerRateLimit(app);
    app.get("/health", async () => ({ status: "ok" }));
    app.get("/test", async () => ({ data: "ok" }));
    await app.ready();
  });

  afterAll(async () => {
    delete process.env.RATE_LIMIT_RPM;
    await app.close();
  });

  beforeEach(() => {
    resetRateLimitState();
  });

  it("allows requests within the limit", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ method: "GET", url: "/test" });
      expect(res.statusCode).toBe(200);
    }
  });

  it("rejects requests exceeding the limit", async () => {
    for (let i = 0; i < 5; i++) {
      await app.inject({ method: "GET", url: "/test" });
    }
    const res = await app.inject({ method: "GET", url: "/test" });
    expect(res.statusCode).toBe(429);
    expect(res.json().code).toBe("RATE_LIMIT_EXCEEDED");
    expect(res.headers["retry-after"]).toBeDefined();
  });

  it("exempts health endpoint from rate limiting", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
    }
  });
});
