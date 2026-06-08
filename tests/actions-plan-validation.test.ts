/**
 * Unit tests for deterministic plan validation (no LLM).
 *
 * Tests the actionPlanValidator directly, not through HTTP.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { validatePlanDeterministic } from "../src/actions/actionPlanValidator.js";
import { seedActionSchemas, resetActionSchemas } from "../src/actions/actionSchemas.js";

beforeAll(() => {
  resetActionSchemas();
  seedActionSchemas();
});

describe("validatePlanDeterministic", () => {
  it("passes a valid finite plan", async () => {
    const result = await validatePlanDeterministic({
      plan: {
        goal: "Fix bug",
        mode: "finite",
        steps: [
          { action_name: "grep", params: { pattern: "TODO" }, requires_platform_validation: true },
          { action_name: "read_file", params: { path: "src/index.ts" }, requires_platform_validation: true },
        ],
      },
      allowedActions: ["grep", "read_file"],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("fails when action not in allowed set", async () => {
    const result = await validatePlanDeterministic({
      plan: {
        goal: "Test",
        mode: "finite",
        steps: [
          { action_name: "commit", params: { message: "x" }, requires_platform_validation: true },
        ],
      },
      allowedActions: ["grep"],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("commit"))).toBe(true);
  });

  it("fails when params schema is invalid", async () => {
    const result = await validatePlanDeterministic({
      plan: {
        goal: "Test",
        mode: "finite",
        steps: [
          // read_file requires path (min 1 char)
          { action_name: "read_file", params: {}, requires_platform_validation: true },
        ],
      },
      allowedActions: ["read_file"],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.action_name === "read_file" || e.message.includes("read_file"))).toBe(true);
  });

  it("warns when loop mode has no loop_condition", async () => {
    const result = await validatePlanDeterministic({
      plan: {
        goal: "Loop",
        mode: "loop",
        steps: [
          { action_name: "grep", params: { pattern: "x" }, requires_platform_validation: true },
        ],
      },
      allowedActions: ["grep"],
    });
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.message.includes("loop_condition"))).toBe(true);
  });

  it("passes loop mode with loop_condition", async () => {
    const result = await validatePlanDeterministic({
      plan: {
        goal: "Loop",
        mode: "loop",
        steps: [
          { action_name: "grep", params: { pattern: "x" }, requires_platform_validation: true },
        ],
        loop_condition: "Until stopped",
      },
      allowedActions: ["grep"],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("passes open_ended mode with valid apply_patch params", async () => {
    const result = await validatePlanDeterministic({
      plan: {
        goal: "Autonomous",
        mode: "open_ended",
        steps: [
          { action_name: "grep", params: { pattern: "x" }, requires_platform_validation: true },
          { action_name: "apply_patch", params: { path: "src/index.ts", intent: "Fix the bug" }, requires_platform_validation: true },
          { action_name: "run_tests", params: {}, requires_platform_validation: true },
        ],
        loop_condition: "Continue improving",
      },
      allowedActions: ["grep", "apply_patch", "run_tests"],
    });
    expect(result.valid).toBe(true);
  });

  it("rejects invalid plan mode", async () => {
    const result = await validatePlanDeterministic({
      plan: {
        goal: "Test",
        mode: "invalid_mode" as "finite",
        steps: [
          { action_name: "grep", params: { pattern: "x" }, requires_platform_validation: true },
        ],
      },
      allowedActions: ["grep"],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("mode"))).toBe(true);
  });

  it("does not impose a max-step cap", async () => {
    const manySteps = Array.from({ length: 50 }, (_, i) => ({
      action_name: i % 2 === 0 ? "grep" : "read_file",
      params: i % 2 === 0 ? { pattern: `p${i}` } : { path: `f${i}.ts` },
      requires_platform_validation: true as const,
    }));

    const result = await validatePlanDeterministic({
      plan: {
        goal: "Large plan",
        mode: "finite",
        steps: manySteps,
      },
      allowedActions: ["grep", "read_file"],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("does not reject loop plans containing commit when commit is allowed", async () => {
    const result = await validatePlanDeterministic({
      plan: {
        goal: "Improve and commit",
        mode: "loop",
        steps: [
          { action_name: "grep", params: { pattern: "FIXME" }, requires_platform_validation: true },
          { action_name: "apply_patch", params: { path: "src/fix.ts", intent: "Fix the FIXME" }, requires_platform_validation: true },
          { action_name: "run_tests", params: {}, requires_platform_validation: true },
          { action_name: "commit", params: { message: "fix" }, requires_platform_validation: true },
        ],
        loop_condition: "Until all FIXMEs resolved",
      },
      allowedActions: ["grep", "apply_patch", "run_tests", "commit"],
    });
    expect(result.valid).toBe(true);
  });
});
