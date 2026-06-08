/**
 * Schema Validation Parity Tests
 *
 * Reference: Letta tool_manager — extracts parameter schemas from Python type
 * hints and validates before execution. We use Zod safeParse() in the validate
 * stage to achieve equivalent behavior.
 *
 * Goal: No invalid payload should ever reach invoke().
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { createTestApp, destroyTestApp, runPipelineFixture, type ActionFixture } from "../fixtures/runner.js";
import validationFixtures from "../fixtures/action-validation.json";

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await destroyTestApp(app);
});

describe("Schema Validation Parity", () => {
  let blockedCount = 0;
  let invokedInvalidCount = 0;
  let totalInvalid = 0;

  for (const fixture of validationFixtures as ActionFixture[]) {
    it(`[${fixture.name}] ${fixture.expected.validation === "pass" ? "accepts valid payload" : "blocks invalid payload"}`, async () => {
      const result = await runPipelineFixture(app, fixture);

      if (fixture.expected.validation === "pass") {
        expect(result.body.success).toBe(true);
        expect(result.body.stage).toBe("invoke");
      } else {
        totalInvalid++;
        expect(result.body.success).toBe(false);

        if (fixture.expected.failStage) {
          expect(result.body.stage).toBe(fixture.expected.failStage);
        }

        if (fixture.expected.errorCode) {
          expect(result.body.error?.code).toBe(fixture.expected.errorCode);
        }

        if (fixture.expected.issueField && result.body.error?.issues) {
          const issues = result.body.error.issues as Array<{ path: string }>;
          expect(issues.some((i) => i.path === fixture.expected.issueField)).toBe(true);
        }

        // Verify invoke was NOT reached
        if (result.body.stage !== "invoke") {
          blockedCount++;
        } else {
          invokedInvalidCount++;
        }

        // Verify audit record was created
        expect(result.body.audit_id).toBeDefined();
      }
    });
  }

  it("METRIC: 100% invalid payloads blocked", () => {
    expect(totalInvalid).toBeGreaterThan(0);
    expect(blockedCount).toBe(totalInvalid);
    expect(invokedInvalidCount).toBe(0);
  });
});

describe("Schema Validation — Structured Errors", () => {
  it("safeParse failure returns structured issues array", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/validate",
      payload: { action_name: "write_file", params: { path: 123, content: null } },
    });
    const body = res.json();
    expect(body.valid).toBe(false);
    expect(body.issues).toBeDefined();
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
    for (const issue of body.issues) {
      expect(issue.path).toBeDefined();
      expect(issue.message).toBeDefined();
    }
  });

  it("structured errors propagate through pipeline", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: { action_name: "grep", params: {} },
    });
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.stage).toBe("validate");
    expect(body.error.issues).toBeDefined();
    expect(body.error.issues[0].path).toBe("pattern");
  });
});
