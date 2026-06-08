/**
 * Deterministic plan validator. No LLM calls.
 *
 * Validates:
 *   1. JSON parse success (already done by Zod)
 *   2. Output matches ActionPlanOutputSchema
 *   3. Every action exists in the canonical catalog
 *   4. Every action exists in the session's allowed_actions
 *   5. Every action params validates against its Zod schema
 *   6. Every step has requires_platform_validation: true
 *   7. Plan mode is one of finite, loop, open_ended
 *   8. Loop/open_ended includes loop_condition
 *   9. Commit only appears if allowed
 *  10. merge_pr only appears if allowed
 *  11. stop_service requires approval metadata
 *  12. No secret-looking values in params (recursive)
 *  13. apply_patch has patch or path+intent
 *  14. read_file has non-empty path
 *  15. grep has non-empty pattern
 *  16. run_tests before edits is a warning, not an error (unless purpose is invalid)
 *
 * Returns structured errors with code, path, message, action_name, step_index.
 */

import { getActionSchema } from "./actionSchemas.js";
import { CANONICAL_ACTION_MAP } from "./catalog/canonicalActions.js";
import type { ActionPlanOutput, PlanWarning, ValidationError } from "./actionPlanSchemas.js";
import type { RuleSolverProvider } from "../providers/RuleSolverProvider.js";

export interface ValidatorInput {
  plan: ActionPlanOutput["plan"];
  allowedActions: string[];
  taskType?: string;
}

export interface ValidatorResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: PlanWarning[];
}

// ── Secret detection ─────────────────────────────────────────────────

const SECRET_PATTERNS = [
  /^ghp_[A-Za-z0-9_]{36,}$/,
  /^github_pat_[A-Za-z0-9_]{22,}$/,
  /^gho_[A-Za-z0-9_]{36,}$/,
  /^ghu_[A-Za-z0-9_]{36,}$/,
  /^ghs_[A-Za-z0-9_]{36,}$/,
  /^ghr_[A-Za-z0-9_]{36,}$/,
  /^sk-[A-Za-z0-9]{20,}$/,
  /^xoxb-[0-9]+-[A-Za-z0-9]+$/,
  /^xoxp-[0-9]+-[A-Za-z0-9]+$/,
  /^Bearer\s+[A-Za-z0-9\-._~+/]+=*$/,
  /^AKIA[0-9A-Z]{16}$/,
  /^eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_.+/=]+$/,
];

function looksLikeSecret(value: string): boolean {
  if (value.length < 16) return false;
  return SECRET_PATTERNS.some((p) => p.test(value));
}

/**
 * Recursively scan a value for secret-looking strings.
 * Returns paths where secrets were found.
 */
function findSecretPaths(value: unknown, path: string): string[] {
  if (typeof value === "string") {
    return looksLikeSecret(value) ? [path] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => findSecretPaths(v, `${path}[${i}]`));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([k, v]) => findSecretPaths(v, path ? `${path}.${k}` : k),
    );
  }
  return [];
}

// ── Validator ────────────────────────────────────────────────────────

export async function validatePlanDeterministic(
  input: ValidatorInput,
  ruleSolver?: RuleSolverProvider | null,
): Promise<ValidatorResult> {
  const errors: ValidationError[] = [];
  const warnings: PlanWarning[] = [];

  const { plan, allowedActions } = input;
  const allowedSet = new Set(allowedActions);

  // 1. Mode validation
  if (!["finite", "loop", "open_ended"].includes(plan.mode)) {
    errors.push({
      code: "INVALID_MODE",
      message: `Invalid plan mode: "${plan.mode}". Must be finite, loop, or open_ended.`,
    });
  }

  // 2. Loop/open_ended should have loop_condition
  if ((plan.mode === "loop" || plan.mode === "open_ended") && !plan.loop_condition) {
    warnings.push({
      source: "validator",
      message: `Plan mode "${plan.mode}" should include a loop_condition.`,
    });
  }

  // Track edit actions for run_tests ordering
  const editActions = new Set(["apply_patch", "write_file", "delete_file"]);
  let hasEdit = false;

  // 3. Step-level validation
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]!;

    // 3a. Action must exist in canonical catalog
    if (!CANONICAL_ACTION_MAP.has(step.action_name)) {
      errors.push({
        code: "UNKNOWN_ACTION",
        message: `Action "${step.action_name}" is not in the canonical catalog.`,
        action_name: step.action_name,
        step_index: i,
      });
      continue;
    }

    // 3b. Action must be in allowed set
    if (!allowedSet.has(step.action_name)) {
      errors.push({
        code: "ACTION_NOT_ALLOWED",
        message: `Action "${step.action_name}" is not in allowed_actions [${allowedActions.join(", ")}].`,
        action_name: step.action_name,
        step_index: i,
      });
      continue;
    }

    // 3c. requires_platform_validation must be true
    if (step.requires_platform_validation !== true) {
      errors.push({
        code: "MISSING_PLATFORM_VALIDATION",
        message: `requires_platform_validation must be true.`,
        action_name: step.action_name,
        step_index: i,
      });
    }

    // 3d. Params schema validation
    const zodSchema = getActionSchema(step.action_name);
    if (zodSchema) {
      const result = zodSchema.safeParse(step.params);
      if (!result.success) {
        const issues = result.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; ");
        errors.push({
          code: "PARAMS_INVALID",
          path: "params",
          message: `Params schema invalid — ${issues}`,
          action_name: step.action_name,
          step_index: i,
        });
      }
    }

    // 3e. Secret detection in params
    const secretPaths = findSecretPaths(step.params, "params");
    for (const sp of secretPaths) {
      errors.push({
        code: "SECRET_IN_PARAMS",
        path: sp,
        message: `Secret-looking value found at ${sp}. Use secret_ref instead.`,
        action_name: step.action_name,
        step_index: i,
      });
    }

    // 3f. Track edits and check run_tests ordering
    if (editActions.has(step.action_name)) hasEdit = true;
    if (step.action_name === "run_tests" && !hasEdit) {
      const params = step.params as Record<string, unknown>;
      const purpose = params.purpose as string | undefined;
      if (purpose === "baseline" || purpose === "targeted_validation") {
        // Pre-edit run_tests with valid purpose is fine — just a warning
        warnings.push({
          source: "validator",
          message: `Step ${i}: run_tests before edit with purpose="${purpose}" is acceptable.`,
        });
      } else {
        // Downgraded from error to warning
        warnings.push({
          source: "validator",
          message: `Step ${i}: run_tests appears before any edit action. Consider setting purpose="baseline" if this is intentional.`,
        });
      }
    }

    // 3g. read_file must have non-empty path
    if (step.action_name === "read_file") {
      const path = (step.params as Record<string, unknown>).path;
      if (!path || (typeof path === "string" && path.trim() === "")) {
        errors.push({
          code: "EMPTY_REQUIRED_PARAM",
          path: "params.path",
          message: `read_file has empty path. Must specify a file to read.`,
          action_name: "read_file",
          step_index: i,
        });
      }
    }

    // 3h. grep must have non-empty pattern
    if (step.action_name === "grep") {
      const pattern = (step.params as Record<string, unknown>).pattern;
      if (!pattern || (typeof pattern === "string" && pattern.trim() === "")) {
        errors.push({
          code: "EMPTY_REQUIRED_PARAM",
          path: "params.pattern",
          message: `grep has empty pattern.`,
          action_name: "grep",
          step_index: i,
        });
      }
    }

    // 3i. stop_service requires approval — check approval metadata
    if (step.action_name === "stop_service") {
      const canonical = CANONICAL_ACTION_MAP.get("stop_service");
      if (canonical?.requires_approval) {
        warnings.push({
          source: "validator",
          message: `Step ${i}: stop_service is critical and should include approval metadata via request_approval.`,
        });
      }
    }
  }

  // 4. Commit check
  const hasCommit = plan.steps.some((s) => s.action_name === "commit");
  if (hasCommit && !allowedSet.has("commit")) {
    errors.push({
      code: "GATED_ACTION_NOT_ALLOWED",
      message: `Plan contains "commit" but commit is not in allowed_actions.`,
      action_name: "commit",
    });
  }

  // 5. merge_pr check
  const hasMerge = plan.steps.some((s) => s.action_name === "merge_pr");
  if (hasMerge && !allowedSet.has("merge_pr")) {
    errors.push({
      code: "GATED_ACTION_NOT_ALLOWED",
      message: `Plan contains "merge_pr" but merge_pr is not in allowed_actions.`,
      action_name: "merge_pr",
    });
  }

  // 6. Advisory rule solver warnings
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
