/**
 * Audit Completeness Parity Tests
 *
 * Reference: cognee AgenticRetriever — records tool-call traces in the
 * retrieval loop (agentic_retriever.py). Our pipeline goes further by
 * creating durable audit records at every stage transition.
 *
 * Goal: 100% action attempts audited, 0 orphan executions.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { createTestApp, destroyTestApp, runPipelineFixture, type ActionFixture } from "../fixtures/runner.js";
import auditFixtures from "../fixtures/action-audit.json";

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await destroyTestApp(app);
});

describe("Audit Completeness Parity", () => {
  let totalAttempts = 0;
  let totalAudited = 0;
  let orphanExecutions = 0;

  for (const fixture of auditFixtures as ActionFixture[]) {
    it(`[${fixture.name}] creates complete audit trail`, async () => {
      totalAttempts++;
      const result = await runPipelineFixture(app, fixture);

      // Every pipeline execution must produce an audit_id
      expect(result.body.audit_id).toBeDefined();
      totalAudited++;

      // Fetch the audit record
      const auditRes = await app.inject({
        method: "GET",
        url: `/audits/${result.body.audit_id}`,
      });
      const audit = auditRes.json();

      // Verify audit fields
      expect(audit.action_name).toBe(fixture.action);
      expect(audit.started_at).toBeDefined();

      if (fixture.expected.finalStatus) {
        expect(audit.status).toBe(fixture.expected.finalStatus);
      }

      if (fixture.expected.hasOutput) {
        expect(audit.output).toBeDefined();
        expect(audit.output).not.toBeNull();
      }

      if (fixture.expected.hasError) {
        expect(audit.error).toBeDefined();
        expect(audit.error).not.toBeNull();
        if (fixture.expected.errorCode) {
          expect(audit.error.code).toBe(fixture.expected.errorCode);
        }
      }

      if (fixture.expected.hasRationale) {
        expect(audit.rationale).toBe(fixture.rationale);
      }

      if (fixture.expected.hasSessionId) {
        expect(audit.session_id).toBeDefined();
        expect(audit.session_id).not.toBeNull();
      }

      // Verify completed_at is set for terminal states
      if (audit.status === "executed" || audit.status === "failed") {
        expect(audit.completed_at).toBeDefined();
        expect(audit.completed_at).not.toBeNull();
      }

      // Check for orphan executions (executed without audit)
      if (result.body.success && !result.body.audit_id) {
        orphanExecutions++;
      }
    });
  }

  it("METRIC: 100% action attempts audited", () => {
    expect(totalAttempts).toBeGreaterThan(0);
    expect(totalAudited).toBe(totalAttempts);
  });

  it("METRIC: 0 orphan executions", () => {
    expect(orphanExecutions).toBe(0);
  });
});

describe("Audit — Status Transitions", () => {
  it("successful execution: requested → validated → executed", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: { action_name: "grep", params: { pattern: "status-transition" } },
    });
    const body = res.json();
    expect(body.success).toBe(true);

    const auditRes = await app.inject({ method: "GET", url: `/audits/${body.audit_id}` });
    const audit = auditRes.json();
    expect(audit.status).toBe("executed");
    expect(audit.output).toBeDefined();
  });

  it("validation failure: requested → failed", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: { action_name: "read_file", params: {} },
    });
    const body = res.json();
    expect(body.success).toBe(false);

    const auditRes = await app.inject({ method: "GET", url: `/audits/${body.audit_id}` });
    const audit = auditRes.json();
    expect(audit.status).toBe("failed");
    expect(audit.error).toBeDefined();
  });

  it("permission denial: requested → failed", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: { action_name: "commit", params: { message: "test" } },
    });
    const body = res.json();
    expect(body.success).toBe(false);

    const auditRes = await app.inject({ method: "GET", url: `/audits/${body.audit_id}` });
    const audit = auditRes.json();
    expect(audit.status).toBe("failed");
  });

  it("lookup failure: requested → failed", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: { action_name: "does_not_exist", params: {} },
    });
    const body = res.json();

    const auditRes = await app.inject({ method: "GET", url: `/audits/${body.audit_id}` });
    const audit = auditRes.json();
    expect(audit.status).toBe("failed");
    expect(audit.error.code).toBe("ACTION_NOT_FOUND");
  });
});

describe("Audit — Input/Output Capture", () => {
  it("captures input params in audit record", async () => {
    const params = { pattern: "capture-test-input" };
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: { action_name: "grep", params },
    });
    const auditRes = await app.inject({ method: "GET", url: `/audits/${res.json().audit_id}` });
    expect(auditRes.json().input).toEqual(params);
  });

  it("captures output in audit record on success", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: { action_name: "run_tests", params: {} },
    });
    const auditRes = await app.inject({ method: "GET", url: `/audits/${res.json().audit_id}` });
    const audit = auditRes.json();
    expect(audit.output).toBeDefined();
    expect(audit.output).not.toBeNull();
  });

  it("captures error in audit record on failure", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: { action_name: "read_file", params: { path: 42 } },
    });
    const auditRes = await app.inject({ method: "GET", url: `/audits/${res.json().audit_id}` });
    const audit = auditRes.json();
    expect(audit.error).toBeDefined();
  });
});
