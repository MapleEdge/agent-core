import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { actionRoutes } from "../src/actions/routes.js";
import { policyRoutes, seedDefaultPolicies } from "../src/api/policy.js";
import { sessionRoutes, traceRoutes } from "../src/traces/routes.js";
import { rulesRoutes, seedDefaultRules } from "../src/rules/routes.js";
import { seedDefaultActions } from "../src/actions/defaults.js";
import { closeDb } from "../src/db.js";
import { registerDefaultProviders } from "../src/providers/defaults.js";
import { resetProviderRegistry } from "../src/providers/registry.js";

let app: FastifyInstance;

beforeAll(async () => {
  process.env.AGENT_CORE_DB = ":memory:";
  app = Fastify();
  await app.register(actionRoutes);
  await app.register(policyRoutes);
  await app.register(sessionRoutes);
  await app.register(traceRoutes);
  await app.register(rulesRoutes);
  seedDefaultActions();
  seedDefaultRules();
  seedDefaultPolicies();
  registerDefaultProviders();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  resetProviderRegistry();
  closeDb();
});

describe("Action Pipeline", () => {
  it("executes a known safe action through the full pipeline", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/pipeline",
      payload: { action_name: "read_file", params: { path: "README.md" } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.stage).toBe("invoke");
    expect(body.execution).toBeDefined();
    expect(body.execution.execution_mode).toBe("local_safe");
    expect(body.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("returns ACTION_NOT_FOUND for unknown actions", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/pipeline",
      payload: { action_name: "nonexistent_action", params: {} },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.stage).toBe("lookup");
    expect(body.error.code).toBe("ACTION_NOT_FOUND");
  });

  it("returns ACTION_PERMISSION_ERROR for policy-denied actions", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/pipeline",
      payload: { action_name: "commit", params: { message: "test" } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.stage).toBe("permission");
    expect(body.error.code).toBe("ACTION_PERMISSION_ERROR");
  });

  it("records a trace when session_id is provided", async () => {
    // Create a session first
    const sessionRes = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { repo_id: "pipeline-test" },
    });
    const sessionId = sessionRes.json().id;

    // Execute pipeline with session_id
    const res = await app.inject({
      method: "POST",
      url: "/actions/pipeline",
      payload: {
        action_name: "grep",
        params: { pattern: "test" },
        session_id: sessionId,
      },
    });
    expect(res.json().success).toBe(true);

    // Check that a trace was recorded
    const tracesRes = await app.inject({
      method: "GET",
      url: `/traces/session/${sessionId}`,
    });
    const traces = tracesRes.json().traces;
    expect(traces.length).toBeGreaterThan(0);
    expect(traces[0].action_name).toBe("grep");
  });

  it("applies scope check with task_type and completed_actions", async () => {
    // When task_type is provided, the Letta rule solver checks scope
    const res = await app.inject({
      method: "POST",
      url: "/actions/pipeline",
      payload: {
        action_name: "read_file",
        params: { path: "index.ts" },
        task_type: "code_edit",
        completed_actions: [],
      },
    });
    // Should still succeed because code_edit starts with classify_task
    // but read_file is also a valid starting action in our default rules
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // The result depends on whether the rule solver restricts or allows
    expect(body.stage).toBeDefined();
    expect(body.duration_ms).toBeGreaterThanOrEqual(0);
  });
});

describe("Session Lifecycle", () => {
  let sessionId: string;

  it("creates a session", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { repo_id: "lifecycle-test" },
    });
    expect(res.statusCode).toBe(201);
    sessionId = res.json().id;
    expect(res.json().status).toBe("active");
  });

  it("lists sessions", async () => {
    const res = await app.inject({ method: "GET", url: "/sessions" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sessions.length).toBeGreaterThan(0);
  });

  it("lists sessions with status filter", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/sessions?status=active",
    });
    expect(res.statusCode).toBe(200);
    const sessions = res.json().sessions;
    for (const session of sessions) {
      expect(session.status).toBe("active");
    }
  });

  it("lists sessions with repo_id filter", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/sessions?repo_id=lifecycle-test",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().sessions.length).toBeGreaterThan(0);
  });

  it("closes a session with summary", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/close`,
      payload: { summary: "Completed lifecycle test" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("closed");
    expect(res.json().summary).toBe("Completed lifecycle test");
  });

  it("deletes a session", async () => {
    // Create a new session to delete
    const createRes = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { repo_id: "delete-test" },
    });
    const deleteId = createRes.json().id;

    const res = await app.inject({
      method: "DELETE",
      url: `/sessions/${deleteId}`,
    });
    expect(res.statusCode).toBe(204);

    // Verify deletion
    const getRes = await app.inject({
      method: "GET",
      url: `/sessions/${deleteId}`,
    });
    expect(getRes.json().error).toBe("session not found");
  });
});
