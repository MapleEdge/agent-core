/**
 * Mutation Testing for Safety-Critical Logic
 *
 * Simulates mutations by exercising code paths that would break if
 * safety checks were removed. Each test documents which mutation it
 * detects and why the mutation would be dangerous.
 *
 * Mutations tested:
 * 1. Remove safeParse() → invalid params reach invoke
 * 2. Skip permission check → unauthorized actions execute
 * 3. Skip audit creation → orphan executions
 * 4. Skip rationale persistence → rationale lost
 * 5. Allow unknown action → arbitrary code execution risk
 * 6. Ignore approval gate → destructive actions execute
 *
 * Goal: mutation score > 90% — all safety-critical mutations detected.
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

let detected = 0;
const totalMutations = 12;

describe("Mutation: Remove safeParse()", () => {
  it("M1a: missing field is caught by validation", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: { action_name: "read_file", params: {} },
    });
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.stage).toBe("validate");
    detected++;
  });

  it("M1b: wrong type is caught by validation", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: { action_name: "read_file", params: { path: 42 } },
    });
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.stage).toBe("validate");
    detected++;
  });
});

describe("Mutation: Skip permission check", () => {
  it("M2a: approval-required action is blocked", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: { action_name: "commit", params: { message: "test" } },
    });
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.stage).toBe("permission");
    expect(body.error.code).toBe("ACTION_PERMISSION_ERROR");
    detected++;
  });

  it("M2b: scope-denied action is blocked", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: {
        action_name: "summarize_diff",
        params: {},
        task_type: "code_edit",
        completed_actions: [],
      },
    });
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.stage).toBe("scope");
    detected++;
  });
});

describe("Mutation: Skip audit creation", () => {
  it("M3a: successful execution has audit", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: { action_name: "grep", params: { pattern: "mutation-audit" } },
    });
    expect(res.json().audit_id).toBeDefined();
    const auditRes = await app.inject({
      method: "GET",
      url: `/audits/${res.json().audit_id}`,
    });
    expect(auditRes.json().action_name).toBe("grep");
    detected++;
  });

  it("M3b: failed execution has audit", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: { action_name: "read_file", params: {} },
    });
    expect(res.json().audit_id).toBeDefined();
    const auditRes = await app.inject({
      method: "GET",
      url: `/audits/${res.json().audit_id}`,
    });
    expect(auditRes.json().status).toBe("failed");
    detected++;
  });
});

describe("Mutation: Skip rationale persistence", () => {
  it("M4a: rationale stored in audit", async () => {
    const rationale = "Since the user wants mutation testing, thus I am verifying rationale persistence.";
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: { action_name: "grep", params: { pattern: "mutation-rationale" }, rationale },
    });
    const auditRes = await app.inject({
      method: "GET",
      url: `/audits/${res.json().audit_id}`,
    });
    expect(auditRes.json().rationale).toBe(rationale);
    detected++;
  });

  it("M4b: rationale returned in response", async () => {
    const rationale = "Since the user wants quality assurance, thus I am running checks.";
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: { action_name: "run_tests", params: {}, rationale },
    });
    expect(res.json().rationale).toBe(rationale);
    detected++;
  });
});

describe("Mutation: Allow unknown action", () => {
  it("M5a: unknown action is rejected at lookup", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: { action_name: "exec_arbitrary_code", params: {} },
    });
    expect(res.json().success).toBe(false);
    expect(res.json().stage).toBe("lookup");
    expect(res.json().error.code).toBe("ACTION_NOT_FOUND");
    detected++;
  });

  it("M5b: unregistered action name rejected", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: { action_name: "inject_payload", params: {} },
    });
    expect(res.json().success).toBe(false);
    detected++;
  });
});

describe("Mutation: Ignore approval gate", () => {
  it("M6a: commit is always blocked", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: { action_name: "commit", params: { message: "bypass" } },
    });
    expect(res.json().success).toBe(false);
    expect(res.json().stage).toBe("permission");
    detected++;
  });

  it("M6b: deploy blocked by policy", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: { action_name: "deploy", params: {} },
    });
    const body = res.json();
    expect(body.success).toBe(false);
    // deploy either not found or permission denied
    expect(["permission", "lookup"].includes(body.stage)).toBe(true);
    detected++;
  });
});

describe("Mutation Score", () => {
  it(`METRIC: mutation score >= 90% (${totalMutations} mutations)`, () => {
    const score = (detected / totalMutations) * 100;
    expect(score).toBeGreaterThanOrEqual(90);
  });
});
