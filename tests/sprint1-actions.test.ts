import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { actionRoutes } from "../src/actions/routes.js";
import { policyRoutes, seedDefaultPolicies } from "../src/api/policy.js";
import { sessionRoutes, traceRoutes } from "../src/traces/routes.js";
import { rulesRoutes, seedDefaultRules } from "../src/rules/routes.js";
import { seedDefaultActions } from "../src/actions/defaults.js";
import { seedActionSchemas, resetActionSchemas } from "../src/actions/actionSchemas.js";
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
  seedActionSchemas();
  seedDefaultRules();
  seedDefaultPolicies();
  registerDefaultProviders();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  resetProviderRegistry();
  resetActionSchemas();
  closeDb();
});

// ── 1. Zod Schema Validation ──────────────────────────────────────

describe("Zod Schema Validation", () => {
  it("valid payload succeeds", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/validate",
      payload: { action_name: "read_file", params: { path: "src/index.ts" } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(true);
  });

  it("missing required fields fail", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/validate",
      payload: { action_name: "read_file", params: {} },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(false);
    expect(body.issues).toBeDefined();
    expect(body.issues.length).toBeGreaterThan(0);
    expect(body.issues[0].path).toBe("path");
  });

  it("wrong types fail", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/validate",
      payload: { action_name: "read_file", params: { path: 42 } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(false);
    expect(body.issues).toBeDefined();
    expect(body.issues[0].path).toBe("path");
  });

  it("empty string fails min(1) check", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/validate",
      payload: { action_name: "read_file", params: { path: "" } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(false);
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("unknown action fails validation", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/validate",
      payload: { action_name: "nonexistent", params: {} },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(false);
    expect(body.errors[0]).toContain("Unknown action");
  });

  it("write_file requires path and content", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/validate",
      payload: { action_name: "write_file", params: { path: "foo.ts" } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(false);
    expect(body.issues.some((i: { path: string }) => i.path === "content")).toBe(true);
  });

  it("optional params are not required", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/validate",
      payload: { action_name: "run_tests", params: {} },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().valid).toBe(true);
  });

  it("pipeline rejects invalid params at validate stage", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/pipeline",
      payload: { action_name: "read_file", params: {} },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.stage).toBe("validate");
    expect(body.error.code).toBe("ACTION_VALIDATION_ERROR");
    expect(body.error.issues).toBeDefined();
    expect(body.error.issues.length).toBeGreaterThan(0);
  });

  it("pipeline passes valid params through validate stage", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/pipeline",
      payload: { action_name: "read_file", params: { path: "README.md" } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.stage).toBe("invoke");
  });
});

// ── 2. Action Schema Exposure ─────────────────────────────────────

describe("Action Schema Exposure", () => {
  it("GET /actions returns JSON schema for each action", async () => {
    const res = await app.inject({ method: "GET", url: "/actions" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const readFile = body.actions.find((a: { name: string }) => a.name === "read_file");
    expect(readFile).toBeDefined();
    // ActionKnowledgeProvider returns params_json_schema (MCP-compatible)
    expect(readFile.params_json_schema).toBeDefined();
    expect(readFile.params_json_schema.type).toBe("object");
    expect(readFile.params_json_schema.properties).toBeDefined();
    expect(readFile.params_json_schema.properties.path).toBeDefined();
    expect(readFile.requires_platform_validation).toBe(true);
  });

  it("GET /actions/:id returns JSON schema", async () => {
    const res = await app.inject({ method: "GET", url: "/actions/grep" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // MCP-compatible response uses params_json_schema
    expect(body.params_json_schema).toBeDefined();
    expect(body.params_json_schema.properties.pattern).toBeDefined();
  });
});

// ── 3. Audit Records ──────────────────────────────────────────────

describe("Audit Records", () => {
  let auditId: string;
  let sessionId: string;

  it("pipeline creates an audit record on successful execution", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/pipeline",
      payload: { action_name: "grep", params: { pattern: "test" } },
    });
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.audit_id).toBeDefined();
    auditId = body.audit_id;

    // Fetch the audit record
    const auditRes = await app.inject({
      method: "GET",
      url: `/audits/${auditId}`,
    });
    expect(auditRes.statusCode).toBe(200);
    const audit = auditRes.json();
    expect(audit.action_name).toBe("grep");
    expect(audit.status).toBe("executed");
    expect(audit.input).toEqual({ pattern: "test" });
    expect(audit.started_at).toBeDefined();
    expect(audit.completed_at).toBeDefined();
  });

  it("pipeline creates a failed audit on validation failure", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/pipeline",
      payload: { action_name: "read_file", params: {} },
    });
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.audit_id).toBeDefined();

    const auditRes = await app.inject({
      method: "GET",
      url: `/audits/${body.audit_id}`,
    });
    const audit = auditRes.json();
    expect(audit.status).toBe("failed");
    expect(audit.error).toBeDefined();
  });

  it("pipeline creates a failed audit on lookup failure", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/pipeline",
      payload: { action_name: "nonexistent", params: {} },
    });
    const body = res.json();
    expect(body.audit_id).toBeDefined();

    const auditRes = await app.inject({
      method: "GET",
      url: `/audits/${body.audit_id}`,
    });
    const audit = auditRes.json();
    expect(audit.status).toBe("failed");
    expect(audit.error.code).toBe("ACTION_NOT_FOUND");
  });

  it("GET /audits lists all audit records", async () => {
    const res = await app.inject({ method: "GET", url: "/audits" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.audits.length).toBeGreaterThanOrEqual(3);
  });

  it("GET /audits?action_name= filters by action", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/audits?action_name=grep",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.audits.every((a: { action_name: string }) => a.action_name === "grep")).toBe(true);
  });

  it("GET /sessions/:id/audits returns session-scoped audits", async () => {
    // Create a session
    const sessionRes = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { repo_id: "audit-test" },
    });
    sessionId = sessionRes.json().id;

    // Execute pipeline with session_id
    await app.inject({
      method: "POST",
      url: "/actions/pipeline",
      payload: {
        action_name: "grep",
        params: { pattern: "audit" },
        session_id: sessionId,
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `/sessions/${sessionId}/audits`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.session_id).toBe(sessionId);
    expect(body.audits.length).toBeGreaterThanOrEqual(1);
    expect(body.audits[0].session_id).toBe(sessionId);
  });

  it("GET /audits/:id returns 'not found' for unknown id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/audits/nonexistent-id",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().error).toBe("audit record not found");
  });
});

// ── 4. Rationale Field ────────────────────────────────────────────

describe("Rationale", () => {
  it("rationale appears in pipeline response", async () => {
    const rationale = "Since the user wants to find test patterns, thus I am searching the codebase to identify test locations.";
    const res = await app.inject({
      method: "POST",
      url: "/actions/pipeline",
      payload: {
        action_name: "grep",
        params: { pattern: "test" },
        rationale,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.rationale).toBe(rationale);
  });

  it("rationale is stored in audit record", async () => {
    const rationale = "Since the user wants the file read, thus I am reading the file to understand its contents.";
    const res = await app.inject({
      method: "POST",
      url: "/actions/pipeline",
      payload: {
        action_name: "read_file",
        params: { path: "README.md" },
        rationale,
      },
    });
    const auditId = res.json().audit_id;

    const auditRes = await app.inject({
      method: "GET",
      url: `/audits/${auditId}`,
    });
    expect(auditRes.json().rationale).toBe(rationale);
  });

  it("rationale appears in execute response", async () => {
    const rationale = "Since the user wants tests run, thus I am executing the test suite to verify correctness.";
    const res = await app.inject({
      method: "POST",
      url: "/actions/execute",
      payload: {
        action_name: "run_tests",
        params: {},
        rationale,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().rationale).toBe(rationale);
  });

  it("pipeline works without rationale (optional)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/pipeline",
      payload: { action_name: "grep", params: { pattern: "test" } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ── 5. Timeline Integration ───────────────────────────────────────

describe("Timeline Integration", () => {
  it("pipeline emits ACTION_REQUESTED, ACTION_VALIDATED, ACTION_EXECUTED events on success", async () => {
    const sessionRes = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { repo_id: "timeline-test" },
    });
    const sessionId = sessionRes.json().id;

    const rationale = "Since the user wants to search, thus I am grepping for the pattern.";
    await app.inject({
      method: "POST",
      url: "/actions/pipeline",
      payload: {
        action_name: "grep",
        params: { pattern: "test" },
        session_id: sessionId,
        rationale,
      },
    });

    const timelineRes = await app.inject({
      method: "GET",
      url: `/sessions/${sessionId}/timeline`,
    });
    const events = timelineRes.json().events;
    const actionEvents = events.filter((e: { data: Record<string, unknown> }) => {
      const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      return data.action_name === "grep";
    });
    expect(actionEvents.length).toBeGreaterThanOrEqual(3);
  });

  it("pipeline emits ACTION_FAILED event on validation failure", async () => {
    const sessionRes = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { repo_id: "timeline-fail-test" },
    });
    const sessionId = sessionRes.json().id;

    await app.inject({
      method: "POST",
      url: "/actions/pipeline",
      payload: {
        action_name: "read_file",
        params: {},
        session_id: sessionId,
      },
    });

    const timelineRes = await app.inject({
      method: "GET",
      url: `/sessions/${sessionId}/timeline`,
    });
    const events = timelineRes.json().events;

    // Should have ACTION_REQUESTED and ACTION_FAILED
    const actionEvents = events.filter((e: { data: Record<string, unknown> }) => {
      const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      return data.action_name === "read_file";
    });
    expect(actionEvents.length).toBeGreaterThanOrEqual(2);
  });

  it("timeline events include rationale and audit_id", async () => {
    const sessionRes = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { repo_id: "timeline-rationale-test" },
    });
    const sessionId = sessionRes.json().id;

    const rationale = "Since the user wants context, thus I am retrieving context nodes.";
    const pipelineRes = await app.inject({
      method: "POST",
      url: "/actions/pipeline",
      payload: {
        action_name: "retrieve_context",
        params: {},
        session_id: sessionId,
        rationale,
      },
    });
    const auditId = pipelineRes.json().audit_id;

    const timelineRes = await app.inject({
      method: "GET",
      url: `/sessions/${sessionId}/timeline`,
    });
    const events = timelineRes.json().events;
    const actionEvent = events.find((e: { data: Record<string, unknown> }) => {
      const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      return data.action_name === "retrieve_context" && data.audit_id;
    });
    expect(actionEvent).toBeDefined();
    const data = typeof actionEvent.data === "string" ? JSON.parse(actionEvent.data) : actionEvent.data;
    expect(data.rationale).toBe(rationale);
    expect(data.audit_id).toBe(auditId);
  });
});

// ── 6. Regression ─────────────────────────────────────────────────

describe("Regression", () => {
  it("existing actions still list correctly", async () => {
    const res = await app.inject({ method: "GET", url: "/actions" });
    expect(res.statusCode).toBe(200);
    expect(res.json().actions.length).toBeGreaterThanOrEqual(10);
  });

  it("existing action registration works", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/register",
      payload: { name: "regression_action", description: "Test regression" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("existing execute endpoint still works", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/execute",
      payload: { action_name: "run_tests", params: {} },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().executed).toBe(true);
  });

  it("pipeline still handles approval-required actions", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/pipeline",
      payload: { action_name: "commit", params: { message: "test" } },
    });
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.stage).toBe("permission");
    expect(body.error.code).toBe("ACTION_PERMISSION_ERROR");
    expect(body.audit_id).toBeDefined();
  });
});
