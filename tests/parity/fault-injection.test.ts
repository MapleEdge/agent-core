/**
 * Fault Injection Suite
 *
 * Deterministic failure simulations to verify fail-closed behavior.
 * Inject failures at each pipeline stage and verify:
 * - fail closed (no unsafe fall-through)
 * - structured error returned
 * - unauthorized actions never invoke
 * - invalid actions never invoke
 *
 * Goal: 0 unsafe fall-through paths.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { createTestApp, destroyTestApp, runPipelineFixture, type ActionFixture } from "../fixtures/runner.js";
import failureFixtures from "../fixtures/action-failure.json";

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await destroyTestApp(app);
});

describe("Fault Injection — Fixture Tests", () => {
  let unsafeFallThrough = 0;

  for (const fixture of failureFixtures as ActionFixture[]) {
    it(`[${fixture.name}] fails closed`, async () => {
      const result = await runPipelineFixture(app, fixture);

      expect(result.body.success).toBe(false);

      // Verify invoke was NOT reached for expected failures
      if (fixture.expected.invoked === false) {
        if (result.body.stage === "invoke" && result.body.execution?.success) {
          unsafeFallThrough++;
        }
      }

      // Verify audit trail exists
      expect(result.body.audit_id).toBeDefined();

      // Verify error code if specified
      if (fixture.expected.errorCode) {
        expect(result.body.error?.code).toBe(fixture.expected.errorCode);
      }

      // Verify audit status
      if (fixture.expected.auditStatus) {
        const auditRes = await app.inject({
          method: "GET",
          url: `/audits/${result.body.audit_id}`,
        });
        expect(auditRes.json().status).toBe(fixture.expected.auditStatus);
      }
    });
  }

  it("METRIC: 0 unsafe fall-through paths", () => {
    expect(unsafeFallThrough).toBe(0);
  });
});

describe("Fault Injection — Schema Validation Stage", () => {
  const invalidPayloads = [
    { action: "read_file", params: {}, description: "missing required field" },
    { action: "read_file", params: { path: 42 }, description: "wrong type" },
    { action: "read_file", params: { path: "" }, description: "empty string" },
    { action: "read_file", params: { path: null }, description: "null value" },
    { action: "write_file", params: { path: "f.ts" }, description: "missing content" },
    { action: "grep", params: {}, description: "missing pattern" },
    { action: "grep", params: { pattern: 123 }, description: "wrong pattern type" },
    { action: "commit", params: { message: "" }, description: "empty message" },
  ];

  for (const { action, params, description } of invalidPayloads) {
    it(`[${description}] never reaches invoke`, async () => {
      const res = await app.inject({
        method: "POST",
        url: "/actions/pipeline",
        payload: { action_name: action, params },
      });
      const body = res.json();
      // Either fails at validate or at an earlier stage (permission for commit)
      expect(body.success).toBe(false);
      expect(body.stage).not.toBe("invoke");
    });
  }
});

describe("Fault Injection — Permission Stage", () => {
  it("destructive action never invokes", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/pipeline",
      payload: { action_name: "commit", params: { message: "force push" } },
    });
    expect(res.json().success).toBe(false);
    expect(res.json().stage).toBe("permission");
  });

  it("scoped-out action never invokes", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/pipeline",
      payload: {
        action_name: "summarize_diff",
        params: {},
        task_type: "code_edit",
        completed_actions: [],
      },
    });
    expect(res.json().success).toBe(false);
    expect(res.json().stage).toBe("scope");
  });
});

describe("Fault Injection — Lookup Stage", () => {
  const unknownActions = [
    "delete_everything",
    "drop_database",
    "rm_rf_slash",
    "exec_shell",
    "deploy_to_production",
  ];

  for (const action of unknownActions) {
    it(`[${action}] unknown action never invokes`, async () => {
      const res = await app.inject({
        method: "POST",
        url: "/actions/pipeline",
        payload: { action_name: action, params: {} },
      });
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.stage).toBe("lookup");
      expect(body.error.code).toBe("ACTION_NOT_FOUND");
    });
  }
});

describe("Fault Injection — Structured Error Returns", () => {
  it("every failure returns structured error with code and message", async () => {
    const failures = [
      { action_name: "nonexistent", params: {} },
      { action_name: "read_file", params: {} },
      { action_name: "commit", params: { message: "test" } },
    ];

    for (const payload of failures) {
      const res = await app.inject({
        method: "POST",
        url: "/actions/pipeline",
        payload,
      });
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBeDefined();
      expect(body.error.message).toBeDefined();
      expect(typeof body.error.code).toBe("string");
      expect(typeof body.error.message).toBe("string");
    }
  });
});
