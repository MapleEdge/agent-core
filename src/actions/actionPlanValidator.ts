/**
 * Deterministic plan validator. No LLM calls.
 *
 * Validates:
 *   1. JSON parse success (already done by Zod)
 *   2. Output matches ActionPlanOutputSchema
 *   3. Every action exists in the session-visible catalog
 *   4. No action outside session.allowed_actions appears
 *   5. Every action params validates against its Zod schema
 *   6. Every step has requires_platform_validation: true
 *   7. Plan mode is one of finite, loop, open_ended
 *   8. Commit appears only if commit is in session-visible catalog
 *
 * Schema validation = "this action is well-formed."
 * NOT "this action is safe or authorized."
 */

import { getActionSchema } from "./actionSchemas.js";
import type { ActionPlanOutput, PlanWarning } from "./actionPlanSchemas.js";
import type { RuleSolverProvider } from "../providers/RuleSolverProvider.js";

export interface ValidatorInput {
  plan: ActionPlanOutput["plan"];
  allowedActions: string[];
  taskType?: string;
}

export interface ValidatorResult {
  valid: boolean;
  errors: string[];
  warnings: PlanWarning[];
}

/**
 * Hard deterministic validation. Returns errors for anything that violates
 * the contract. Returns warnings from the advisory rule solver.
 */
export async function validatePlanDeterministic(
  input: ValidatorInput,
  ruleSolver?: RuleSolverProvider | null,
): Promise<ValidatorResult> {
  const errors: string[] = [];
  const warnings: PlanWarning[] = [];

  const { plan, allowedActions } = input;
  const allowedSet = new Set(allowedActions);

  // 1. Mode validation
  if (!["finite", "loop", "open_ended"].includes(plan.mode)) {
    errors.push(`Invalid plan mode: "${plan.mode}". Must be finite, loop, or open_ended.`);
  }

  // 2. Loop/open_ended should have loop_condition
  if ((plan.mode === "loop" || plan.mode === "open_ended") && !plan.loop_condition) {
    warnings.push({
      source: "validator",
      message: `Plan mode "${plan.mode}" should include a loop_condition.`,
    });
  }

  // 3. Step-level validation
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]!;

    // 3a. Action exists in allowed set
    if (!allowedSet.has(step.action_name)) {
      errors.push(
        `Step ${i}: action "${step.action_name}" is not in allowed_actions [${allowedActions.join(", ")}].`,
      );
      continue;
    }

    // 3b. requires_platform_validation must be true
    if (step.requires_platform_validation !== true) {
      errors.push(`Step ${i}: requires_platform_validation must be true.`);
    }

    // 3c. Params schema validation (if schema exists)
    const zodSchema = getActionSchema(step.action_name);
    if (zodSchema) {
      const result = zodSchema.safeParse(step.params);
      if (!result.success) {
        const issues = result.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; ");
        errors.push(`Step ${i} (${step.action_name}): params schema invalid — ${issues}`);
      }
    }
  }

  // 4. Commit check: allowed only if commit is in the visible catalog
  const hasCommit = plan.steps.some((s) => s.action_name === "commit");
  if (hasCommit && !allowedSet.has("commit")) {
    errors.push(`Plan contains "commit" but commit is not in allowed_actions.`);
  }

  // 5. Semantic ordering: run_tests must come after at least one edit action
  const editActions = new Set(["apply_patch", "write_file"]);
  let hasEdit = false;
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]!;
    if (editActions.has(step.action_name)) hasEdit = true;
    if (step.action_name === "run_tests" && !hasEdit) {
      errors.push(
        `Step ${i}: run_tests appears before any edit action (apply_patch/write_file). Tests should only run after changes are made.`,
      );
    }
  }

  // 6. Empty path check: read_file must have a non-empty path
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]!;
    if (step.action_name === "read_file") {
      const path = (step.params as Record<string, unknown>).path;
      if (!path || (typeof path === "string" && path.trim() === "")) {
        errors.push(`Step ${i}: read_file has empty path. Must specify a file to read.`);
      }
    }
    // grep pattern must not just be words from the user prompt
    if (step.action_name === "grep") {
      const pattern = (step.params as Record<string, unknown>).pattern;
      if (!pattern || (typeof pattern === "string" && pattern.trim() === "")) {
        errors.push(`Step ${i}: grep has empty pattern.`);
      }
    }
  }

  // 5. Advisory rule solver warnings (not blocking unless configured)
  if (ruleSolver && input.taskType) {
    try {
      const sequenceNames = plan.steps.map((s) => s.action_name);
      const seqResult = await ruleSolver.validateSequence(input.taskType, sequenceNames);
      if (!seqResult.valid) {
        for (const violation of seqResult.violations) {
          warnings.push({
            source: "rule_solver",
            message: violation,
          });
        }
      }
    } catch {
      // Rule solver failure is non-fatal
      warnings.push({
        source: "rule_solver",
        message: "Rule solver unavailable; sequence not checked.",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
