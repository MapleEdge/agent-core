/**
 * LLM-first ActionPlanner.
 *
 * Replaces classifier-first planning. The primary planning path is now:
 *
 *   1. Build prompt from visible catalog + context + memories + outcomes
 *   2. Call LLM with json_mode for structured output
 *   3. Parse + validate output deterministically (Zod + actionPlanValidator)
 *   4. If invalid, attempt repair (actionPlanRepair)
 *   5. Run advisory rule solver warnings (non-blocking)
 *   6. Return validated plan with warnings
 *
 * agent-core validates action contracts.
 * jubilant-goggles validates runtime permissions and executes.
 */

import type { LLMClient } from "../llm/LLMClient.js";
import type { ActionDefinition } from "../providers/ActionKnowledgeProvider.js";
import type { RuleSolverProvider } from "../providers/RuleSolverProvider.js";
import { llmJson } from "../llm/LLMJson.js";
import { buildPlanPrompt } from "./actionPromptBuilder.js";
import { ActionPlanOutputSchema } from "./actionPlanSchemas.js";
import type { ActionPlanOutput, PlanResponse, PlanWarning, ValidationError } from "./actionPlanSchemas.js";
import { validatePlanDeterministic } from "./actionPlanValidator.js";
import { attemptPlanRepair } from "./actionPlanRepair.js";
import { SAMPLE_TEMPLATES } from "./sampleTemplates.js";

export interface PlannerInput {
  session_id: string;
  repo_id?: string;
  prompt: string;
  allowed_actions: string[];
  mode_preference?: string;
  recent_memories?: Record<string, unknown>[];
  context_summaries?: string[];
  recent_action_outcomes?: Record<string, unknown>[];
}

export interface PlannerDependencies {
  llmClient: LLMClient;
  actionCatalog: ActionDefinition[];
  ruleSolver?: RuleSolverProvider | null;
}

/** Convert a plain error string to a structured ValidationError. */
function strError(message: string, code = "PLANNER_ERROR"): ValidationError {
  return { code, message };
}

export async function generatePlan(
  input: PlannerInput,
  deps: PlannerDependencies,
): Promise<PlanResponse> {
  const allowedSet = new Set(input.allowed_actions);
  const warnings: PlanWarning[] = [];
  const errors: ValidationError[] = [];

  // Filter catalog to only session-visible actions
  const visibleCatalog = deps.actionCatalog.filter((a) => allowedSet.has(a.name));

  if (visibleCatalog.length === 0) {
    return {
      ok: false,
      plan: null,
      schema_valid: false,
      requires_platform_validation: true,
      source: "llm_plan_validated_by_agent_core",
      warnings: [],
      errors: [strError("No visible actions in catalog for the given allowed_actions.")],
    };
  }

  // Filter sample templates to only those with visible actions
  const visibleTemplates = SAMPLE_TEMPLATES.filter((t) =>
    t.steps.every((s) => allowedSet.has(s)),
  );

  // Build LLM prompt
  const messages = buildPlanPrompt({
    user_prompt: input.prompt,
    session_id: input.session_id,
    repo_id: input.repo_id,
    allowed_actions: input.allowed_actions,
    action_catalog: visibleCatalog,
    sample_templates: visibleTemplates,
    recent_memories: input.recent_memories ?? [],
    context_summaries: input.context_summaries ?? [],
    recent_action_outcomes: input.recent_action_outcomes ?? [],
    mode_preference: input.mode_preference,
  });

  // Call LLM with schema validation
  const llmResult = await llmJson(deps.llmClient, ActionPlanOutputSchema, messages, {
    temperature: 0.2,
    max_tokens: 4096,
  });

  let plan: ActionPlanOutput | null = null;

  if (llmResult.success) {
    plan = llmResult.data as ActionPlanOutput;
  } else {
    // Attempt repair
    let rawParsed: unknown = null;
    if (llmResult.raw) {
      try {
        rawParsed = JSON.parse(llmResult.raw);
      } catch {
        // Not JSON at all
      }
    }

    if (rawParsed) {
      const repair = attemptPlanRepair(rawParsed, allowedSet);
      if (repair.repaired && repair.plan) {
        plan = repair.plan;
        warnings.push({
          source: "repair",
          message: `Plan was repaired: ${repair.repairs.join("; ")}`,
        });
      } else {
        errors.push(strError(`LLM output invalid and repair failed: ${llmResult.error}`, "LLM_REPAIR_FAILED"));
        if (repair.repairs.length > 0) {
          errors.push(strError(`Repair attempts: ${repair.repairs.join("; ")}`, "LLM_REPAIR_DETAIL"));
        }
      }
    } else {
      errors.push(strError(`LLM failed to produce valid JSON: ${llmResult.error}`, "LLM_PARSE_FAILED"));
    }
  }

  if (!plan) {
    return {
      ok: false,
      plan: null,
      schema_valid: false,
      requires_platform_validation: true,
      source: "llm_plan_validated_by_agent_core",
      warnings,
      errors,
    };
  }

  // Hard deterministic validation
  const validation = await validatePlanDeterministic(
    {
      plan: plan.plan,
      allowedActions: input.allowed_actions,
      taskType: input.mode_preference,
    },
    deps.ruleSolver,
  );

  if (!validation.valid) {
    return {
      ok: false,
      plan: plan.plan,
      schema_valid: false,
      requires_platform_validation: true,
      source: "llm_plan_validated_by_agent_core",
      warnings: [...warnings, ...validation.warnings],
      errors: [...errors, ...validation.errors],
    };
  }

  return {
    ok: true,
    plan: plan.plan,
    schema_valid: true,
    requires_platform_validation: true,
    source: "llm_plan_validated_by_agent_core",
    warnings: [...warnings, ...validation.warnings],
    errors: [],
  };
}
