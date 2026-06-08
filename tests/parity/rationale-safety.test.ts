/**
 * Rationale Safety Tests
 *
 * Rationale format: "Since the user wants <goal>, thus I am <action> to <objective>."
 *
 * Verify: stored in audit, stored in timeline, returned in API response.
 * Reject: internal reasoning, hidden chain-of-thought, private deliberation.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { createTestApp, destroyTestApp, runPipelineFixture, type ActionFixture } from "../fixtures/runner.js";
import rationaleFixtures from "../fixtures/action-rationale.json";

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await destroyTestApp(app);
});

describe("Rationale Parity — Fixture Tests", () => {
  for (const fixture of rationaleFixtures as ActionFixture[]) {
    it(`[${fixture.name}] rationale persistence verified`, async () => {
      const result = await runPipelineFixture(app, fixture);

      if (fixture.expected.persistedInResponse) {
        expect(result.body.rationale).toBe(fixture.rationale);
      }

      if (fixture.expected.persistedInAudit && result.body.audit_id) {
        expect(result.auditRecord?.rationale).toBe(fixture.rationale);
      }

      if (!fixture.expected.persistedInAudit && result.body.audit_id) {
        expect(result.auditRecord?.rationale).toBeNull();
      }

      if (fixture.expected.persistedInTimeline && result.timelineEvents) {
        const actionEvents = result.timelineEvents.filter(
          (e) => e.action_name === fixture.action,
        );
        expect(actionEvents.length).toBeGreaterThan(0);
        expect(actionEvents[0].rationale).toBe(fixture.rationale);
      }
    });
  }
});

describe("Rationale — Survives Entire Pipeline", () => {
  it("rationale in response matches input on success", async () => {
    const rationale = "Since the user wants code patterns found, thus I am searching to locate them.";
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: {
        action_name: "grep",
        params: { pattern: "rationale-survive" },
        rationale,
      },
    });
    expect(res.json().rationale).toBe(rationale);
  });

  it("rationale in response matches input on failure", async () => {
    const rationale = "Since the user wants the file, thus I am reading it.";
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: {
        action_name: "read_file",
        params: {},
        rationale,
      },
    });
    expect(res.json().success).toBe(false);
    expect(res.json().rationale).toBe(rationale);
  });

  it("rationale in audit matches input", async () => {
    const rationale = "Since the user wants tests run, thus I am executing the suite.";
    const res = await app.inject({
      method: "POST",
      url: "/actions/simulate-pipeline",
      payload: {
        action_name: "run_tests",
        params: {},
        rationale,
      },
    });
    const auditRes = await app.inject({
      method: "GET",
      url: `/audits/${res.json().audit_id}`,
    });
    expect(auditRes.json().rationale).toBe(rationale);
  });
});

describe("Rationale — Safety Validation", () => {
  const unsafePatterns = [
    { pattern: "I reasoned that", description: "internal reasoning" },
    { pattern: "my reasoning is", description: "internal reasoning" },
    { pattern: "hidden reasoning", description: "hidden chain-of-thought" },
    { pattern: "internal chain of thought", description: "private deliberation" },
    { pattern: "I decided internally", description: "private deliberation" },
    { pattern: "my hidden analysis", description: "hidden chain-of-thought" },
  ];

  for (const { pattern, description } of unsafePatterns) {
    it(`rejects rationale containing "${description}": "${pattern}"`, () => {
      const containsUnsafe = pattern.toLowerCase().includes("i reasoned") ||
        pattern.toLowerCase().includes("my reasoning") ||
        pattern.toLowerCase().includes("hidden reasoning") ||
        pattern.toLowerCase().includes("internal chain") ||
        pattern.toLowerCase().includes("decided internally") ||
        pattern.toLowerCase().includes("hidden analysis");
      expect(containsUnsafe).toBe(true);
    });
  }

  const safeRationales = [
    "Since the user wants the bug fixed, thus I am running tests to reproduce it.",
    "Since the user wants new auth support, thus I am reading the auth module to plan changes.",
    "Since the user wants code quality improved, thus I am running the linter to identify issues.",
  ];

  for (const rationale of safeRationales) {
    it(`accepts safe rationale: "${rationale.slice(0, 60)}..."`, () => {
      expect(rationale.startsWith("Since the user wants")).toBe(true);
      expect(rationale.includes("thus I am")).toBe(true);
      expect(rationale.includes(" to ")).toBe(true);
    });
  }
});
