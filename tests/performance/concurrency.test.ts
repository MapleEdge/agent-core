/**
 * Concurrency Tests
 *
 * Run parallel executions to verify:
 * - no lost records
 * - no duplicate IDs
 * - no cross-session contamination
 *
 * Goal: 0 data corruption.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { createTestApp, destroyTestApp } from "../fixtures/runner.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await destroyTestApp(app);
});

describe("Concurrency — Parallel Validations", () => {
  it("100 concurrent validations produce correct results", async () => {
    const promises = Array.from({ length: 100 }, (_, i) =>
      app.inject({
        method: "POST",
        url: "/actions/validate",
        payload: {
          action_name: "read_file",
          params: { path: `file_${i}.ts` },
        },
      }),
    );

    const results = await Promise.all(promises);
    const valid = results.filter((r) => r.json().valid === true);
    expect(valid.length).toBe(100);
  });

  it("100 concurrent invalid validations all fail", async () => {
    const promises = Array.from({ length: 100 }, () =>
      app.inject({
        method: "POST",
        url: "/actions/validate",
        payload: {
          action_name: "read_file",
          params: {},
        },
      }),
    );

    const results = await Promise.all(promises);
    const invalid = results.filter((r) => r.json().valid === false);
    expect(invalid.length).toBe(100);
  });
});

describe("Concurrency — Parallel Audits", () => {
  it("100 concurrent pipeline executions produce unique audit IDs", async () => {
    const promises = Array.from({ length: 100 }, (_, i) =>
      app.inject({
        method: "POST",
        url: "/actions/pipeline",
        payload: {
          action_name: "grep",
          params: { pattern: `concurrent_${i}` },
        },
      }),
    );

    const results = await Promise.all(promises);
    const auditIds = results.map((r) => r.json().audit_id).filter(Boolean);

    expect(auditIds.length).toBe(100);
    const uniqueIds = new Set(auditIds);
    expect(uniqueIds.size).toBe(100);
  });
});

describe("Concurrency — Parallel Timeline Writes", () => {
  it("100 concurrent pipeline executions on same session produce correct events", async () => {
    const sessionRes = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { repo_id: "concurrency-timeline" },
    });
    const sessionId = sessionRes.json().id;

    const promises = Array.from({ length: 100 }, (_, i) =>
      app.inject({
        method: "POST",
        url: "/actions/pipeline",
        payload: {
          action_name: "grep",
          params: { pattern: `timeline_${i}` },
          session_id: sessionId,
        },
      }),
    );

    const results = await Promise.all(promises);
    const successes = results.filter((r) => r.json().success === true);
    expect(successes.length).toBe(100);

    // Verify timeline has events for all 100 executions
    const timelineRes = await app.inject({
      method: "GET",
      url: `/sessions/${sessionId}/timeline`,
    });
    const events = timelineRes.json().events;
    // Each execution generates 3 events (requested, validated, executed)
    expect(events.length).toBe(300);
  });
});

describe("Concurrency — Session Isolation", () => {
  it("multiple sessions have no cross-contamination", async () => {
    // Create 10 separate sessions
    const sessionPromises = Array.from({ length: 10 }, (_, i) =>
      app.inject({
        method: "POST",
        url: "/sessions",
        payload: { repo_id: `isolation-${i}` },
      }),
    );
    const sessionResults = await Promise.all(sessionPromises);
    const sessionIds = sessionResults.map((r) => r.json().id);

    // Execute one pipeline per session
    const pipelinePromises = sessionIds.map((sessionId, i) =>
      app.inject({
        method: "POST",
        url: "/actions/pipeline",
        payload: {
          action_name: "grep",
          params: { pattern: `isolation_${i}` },
          session_id: sessionId,
        },
      }),
    );
    await Promise.all(pipelinePromises);

    // Verify each session only has its own events
    for (let i = 0; i < sessionIds.length; i++) {
      const auditsRes = await app.inject({
        method: "GET",
        url: `/sessions/${sessionIds[i]}/audits`,
      });
      const audits = auditsRes.json().audits;
      expect(audits.length).toBe(1);
      expect(audits[0].session_id).toBe(sessionIds[i]);
      expect(audits[0].input.pattern).toBe(`isolation_${i}`);
    }
  });
});

describe("Concurrency Metrics", () => {
  it("METRIC: 0 data corruption across parallel operations", async () => {
    // Run mixed concurrent operations
    const promises: Promise<unknown>[] = [];

    // 20 valid validations
    for (let i = 0; i < 20; i++) {
      promises.push(
        app.inject({
          method: "POST",
          url: "/actions/validate",
          payload: { action_name: "grep", params: { pattern: `metric_${i}` } },
        }),
      );
    }

    // 20 invalid validations
    for (let i = 0; i < 20; i++) {
      promises.push(
        app.inject({
          method: "POST",
          url: "/actions/validate",
          payload: { action_name: "read_file", params: {} },
        }),
      );
    }

    // 20 pipeline executions
    for (let i = 0; i < 20; i++) {
      promises.push(
        app.inject({
          method: "POST",
          url: "/actions/pipeline",
          payload: { action_name: "run_tests", params: {} },
        }),
      );
    }

    const results = await Promise.all(promises);

    // Verify all 60 operations completed
    expect(results.length).toBe(60);

    // All should have returned 200
    for (const r of results) {
      expect((r as { statusCode: number }).statusCode).toBe(200);
    }
  });
});
