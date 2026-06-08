/**
 * Attempt to repair an invalid LLM plan output.
 *
 * Common LLM mistakes and how we fix them:
 *   - Missing requires_platform_validation → inject true
 *   - Action name not in catalog → remove step
 *   - Extra wrapper keys → unwrap to find plan
 *   - Missing goal/mode → inject defaults
 *
 * If repair succeeds, the plan is re-validated. If it still fails,
 * the original errors are returned.
 */

import type { ActionPlanOutput } from "./actionPlanSchemas.js";
import { ActionPlanOutputSchema } from "./actionPlanSchemas.js";

export interface RepairResult {
  repaired: boolean;
  plan: ActionPlanOutput | null;
  repairs: string[];
}

export function attemptPlanRepair(
  raw: unknown,
  allowedActions: Set<string>,
): RepairResult {
  const repairs: string[] = [];

  if (typeof raw !== "object" || raw === null) {
    return { repaired: false, plan: null, repairs: ["Input is not an object."] };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let obj = raw as any;

  // Unwrap if the plan is nested under an extra key
  if (!obj.plan && Object.keys(obj).length === 1) {
    const key = Object.keys(obj)[0]!;
    if (typeof obj[key] === "object" && obj[key] !== null) {
      obj = { plan: obj[key] };
      repairs.push(`Unwrapped plan from key "${key}".`);
    }
  }

  if (!obj.plan || typeof obj.plan !== "object") {
    return { repaired: false, plan: null, repairs: ["No plan object found."] };
  }

  const plan = obj.plan;

  // Inject missing goal
  if (!plan.goal || typeof plan.goal !== "string") {
    plan.goal = "Complete the requested task.";
    repairs.push("Injected default goal.");
  }

  // Inject missing mode
  if (!plan.mode || !["finite", "loop", "open_ended"].includes(plan.mode)) {
    plan.mode = "finite";
    repairs.push(`Repaired mode to "finite".`);
  }

  // Ensure steps is an array
  if (!Array.isArray(plan.steps)) {
    return { repaired: false, plan: null, repairs: [...repairs, "steps is not an array."] };
  }

  // Fix each step
  const validSteps = [];
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    if (!step || typeof step !== "object") continue;

    // Remove steps with unknown actions
    if (!allowedActions.has(step.action_name)) {
      repairs.push(`Removed step ${i}: "${step.action_name}" not in allowed_actions.`);
      continue;
    }

    // Inject requires_platform_validation
    if (step.requires_platform_validation !== true) {
      step.requires_platform_validation = true;
      repairs.push(`Step ${i}: injected requires_platform_validation=true.`);
    }

    // Ensure params is an object
    if (!step.params || typeof step.params !== "object") {
      step.params = {};
      repairs.push(`Step ${i}: injected empty params.`);
    }

    // Reject read_file with empty path
    if (step.action_name === "read_file" && (!step.params.path || step.params.path === "")) {
      repairs.push(`Removed step ${i}: read_file has empty path.`);
      continue;
    }

    // Reject grep with empty pattern
    if (step.action_name === "grep" && (!step.params.pattern || step.params.pattern === "")) {
      repairs.push(`Removed step ${i}: grep has empty pattern.`);
      continue;
    }

    validSteps.push(step);
  }

  plan.steps = validSteps;

  if (plan.steps.length === 0) {
    return { repaired: false, plan: null, repairs: [...repairs, "No valid steps remain after repair."] };
  }

  // Re-validate with Zod
  const result = ActionPlanOutputSchema.safeParse({ plan });
  if (result.success) {
    return { repaired: true, plan: result.data, repairs };
  }

  return {
    repaired: false,
    plan: null,
    repairs: [...repairs, `Post-repair validation failed: ${result.error.message}`],
  };
}
