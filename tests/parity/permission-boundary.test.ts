/**
 * Permission Boundary Parity Tests
 *
 * Inspired by cognee scoped execution.
 * Reference: cognee execute_tool() — get_authorized_existing_datasets()
 *   checks dataset-level ACLs before execution (execute_tool.py:66-78).
 *
 * Our pipeline integrates both Letta-style rule-solver scope AND
 * Parlant-style policy rules, providing richer permission enforcement.
 *
 * Goal: 0 unauthorized executions.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { createTestApp, destroyTestApp, runPipelineFixture, type ActionFixture } from "../fixtures/runner.js";
import permissionFixtures from "../fixtures/action-permissions.json";

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await destroyTestApp(app);
});

describe("Permission Boundary Parity", () => {
  let unauthorizedExecutions = 0;
  let totalDenied = 0;

  for (const fixture of permissionFixtures as ActionFixture[]) {
    it(`[${fixture.name}] ${fixture.expected.allowed ? "allows execution" : "denies execution"}`, async () => {
      const result = await runPipelineFixture(app, fixture);

      if (fixture.expected.allowed) {
        expect(result.body.success).toBe(true);
      } else {
        totalDenied++;
        expect(result.body.success).toBe(false);

        if (fixture.expected.failStage) {
          expect(result.body.stage).toBe(fixture.expected.failStage);
        }

        if (fixture.expected.errorCode) {
          expect(result.body.error?.code).toBe(fixture.expected.errorCode);
        }

        // Verify invoke was NOT reached
        if (result.body.stage === "invoke" && result.body.execution) {
          unauthorizedExecutions++;
        }

        // Verify audit record was created for denied action
        expect(result.body.audit_id).toBeDefined();
      }
    });
  }

  it("METRIC: 0 unauthorized executions", () => {
    expect(totalDenied).toBeGreaterThan(0);
    expect(unauthorizedExecutions).toBe(0);
  });
});

describe("Permission — Scope Enforcement", () => {
  it("action outside rule-solver scope is denied", async () => {
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
    expect(body.error.code).toBe("ACTION_SCOPE_ERROR");
  });

  it("action within scope after correct history is allowed", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: {
        action_name: "read_file",
        params: { path: "index.ts" },
        task_type: "code_edit",
        completed_actions: ["classify_task"],
      },
    });
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.stage).toBe("invoke");
  });
});

describe("Permission — Approval Gate", () => {
  it("approval-required action stops at permission stage", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: { action_name: "commit", params: { message: "deploy" } },
    });
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.stage).toBe("permission");
    expect(body.error.code).toBe("ACTION_PERMISSION_ERROR");
  });
});
