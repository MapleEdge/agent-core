import type { RecommendNextWithPlanInput, RecommendNextWithPlanOutput, VisiblePlanArtifact } from "./planActionTypes.js";
import { getVisiblePlan, markPlanStepCompleted, upsertVisiblePlan } from "./visiblePlanStore.js";

function matchingOpenStepIds(plan: VisiblePlanArtifact | null, actionName: string): string[] {
  if (!plan) return [];
  return plan.steps
    .filter((step) => step.status !== "completed" && step.action_name === actionName)
    .map((step) => step.id);
}

export function coordinateRecommendNext(input: RecommendNextWithPlanInput, rawRecommendation: Record<string, unknown>): RecommendNextWithPlanOutput {
  const activePlan = input.active_plan ?? getVisiblePlan(input.session_id);
  const actionName = String(rawRecommendation.action_name ?? rawRecommendation.next_action ?? rawRecommendation.recommended_action ?? "ask_user");
  const params = typeof rawRecommendation.params === "object" && rawRecommendation.params !== null ? rawRecommendation.params as Record<string, unknown> : {};
  const alignedStepIds = matchingOpenStepIds(activePlan, actionName);
  const planAlignment = !activePlan ? "no_active_plan" : alignedStepIds.length > 0 ? "aligned" : "deviating";

  return {
    action_name: actionName,
    params,
    rationale: String(rawRecommendation.rationale ?? rawRecommendation.reason ?? ""),
    confidence: Number(rawRecommendation.confidence ?? rawRecommendation.certainty ?? 0.5),
    plan_alignment: planAlignment,
    aligned_plan_step_ids: alignedStepIds,
    deviation_reason: planAlignment === "deviating" ? "recommend-next selected an action outside the active visible plan" : undefined,
    requires_plan_revision: planAlignment === "deviating",
  };
}

export function applyOutcomeToVisiblePlan(input: { session_id: string; action_name: string; outcome_id?: string; status: string; evidence?: string[]; }): VisiblePlanArtifact | null {
  if (input.status !== "succeeded") return getVisiblePlan(input.session_id);
  const plan = getVisiblePlan(input.session_id);
  if (!plan) return null;
  const step = plan.steps.find((candidate) => candidate.status !== "completed" && candidate.action_name === input.action_name);
  if (!step) return plan;
  return markPlanStepCompleted({ session_id: input.session_id, step_id: step.id, outcome_id: input.outcome_id, evidence: input.evidence });
}

export function revisePlanAroundRecommendation(input: { plan: VisiblePlanArtifact; recommendation: RecommendNextWithPlanOutput; reason: string; }): VisiblePlanArtifact {
  const insertedStep = {
    id: `plan_step_${Date.now()}`,
    title: `Recommended next: ${input.recommendation.action_name}`,
    action_name: input.recommendation.action_name,
    params_hint: input.recommendation.params,
    status: "active" as const,
    evidence: [input.reason, input.recommendation.deviation_reason ?? "recommend-next deviation"].filter(Boolean),
  };
  return upsertVisiblePlan({ ...input.plan, steps: [insertedStep, ...input.plan.steps] });
}
