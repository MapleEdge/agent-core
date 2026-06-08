/**
 * Unit tests for plan repair logic.
 */

import { describe, it, expect } from "vitest";
import { attemptPlanRepair } from "../src/actions/actionPlanRepair.js";

const allowed = new Set(["grep", "read_file", "run_tests", "commit"]);

describe("attemptPlanRepair", () => {
  it("passes through a valid plan unchanged", () => {
    const result = attemptPlanRepair(
      {
        plan: {
          goal: "Fix bug",
          mode: "finite",
          steps: [
            { action_name: "grep", params: { pattern: "x" }, requires_platform_validation: true },
          ],
        },
      },
      allowed,
    );
    expect(result.repaired).toBe(true);
    expect(result.plan).toBeDefined();
    expect(result.repairs).toEqual([]);
  });

  it("injects requires_platform_validation when missing", () => {
    const result = attemptPlanRepair(
      {
        plan: {
          goal: "Fix",
          mode: "finite",
          steps: [{ action_name: "grep", params: { pattern: "x" } }],
        },
      },
      allowed,
    );
    expect(result.repaired).toBe(true);
    expect(result.plan!.plan.steps[0]!.requires_platform_validation).toBe(true);
    expect(result.repairs.some((r) => r.includes("requires_platform_validation"))).toBe(true);
  });

  it("removes steps with unknown actions", () => {
    const result = attemptPlanRepair(
      {
        plan: {
          goal: "Fix",
          mode: "finite",
          steps: [
            { action_name: "grep", params: { pattern: "x" }, requires_platform_validation: true },
            { action_name: "unknown_action", params: {}, requires_platform_validation: true },
          ],
        },
      },
      allowed,
    );
    expect(result.repaired).toBe(true);
    expect(result.plan!.plan.steps.length).toBe(1);
    expect(result.repairs.some((r) => r.includes("unknown_action"))).toBe(true);
  });

  it("unwraps plan from extra wrapper key", () => {
    const result = attemptPlanRepair(
      {
        response: {
          goal: "Fix",
          mode: "finite",
          steps: [
            { action_name: "grep", params: { pattern: "x" }, requires_platform_validation: true },
          ],
        },
      },
      allowed,
    );
    expect(result.repaired).toBe(true);
    expect(result.repairs.some((r) => r.includes("Unwrapped"))).toBe(true);
  });

  it("injects default goal when missing", () => {
    const result = attemptPlanRepair(
      {
        plan: {
          mode: "finite",
          steps: [
            { action_name: "grep", params: { pattern: "x" }, requires_platform_validation: true },
          ],
        },
      },
      allowed,
    );
    expect(result.repaired).toBe(true);
    expect(result.plan!.plan.goal).toBe("Complete the requested task.");
  });

  it("returns not-repaired when no valid steps remain", () => {
    const result = attemptPlanRepair(
      {
        plan: {
          goal: "Fix",
          mode: "finite",
          steps: [
            { action_name: "completely_unknown", params: {} },
          ],
        },
      },
      allowed,
    );
    expect(result.repaired).toBe(false);
    expect(result.plan).toBeNull();
  });

  it("returns not-repaired for non-object input", () => {
    const result = attemptPlanRepair("not an object", allowed);
    expect(result.repaired).toBe(false);
  });

  it("returns not-repaired for null input", () => {
    const result = attemptPlanRepair(null, allowed);
    expect(result.repaired).toBe(false);
  });
});
