import type { VisiblePlanArtifact } from "./types.js";

const plansBySession = new Map<string, VisiblePlanArtifact>();

export function upsertVisiblePlan(plan: VisiblePlanArtifact): VisiblePlanArtifact {
  const now = new Date().toISOString();
  const normalized: VisiblePlanArtifact = {
    ...plan,
    created_at: plan.created_at ?? now,
    updated_at: now,
  };
  plansBySession.set(plan.session_id, normalized);
  return normalized;
}

export function getVisiblePlan(sessionId: string): VisiblePlanArtifact | null {
  return plansBySession.get(sessionId) ?? null;
}

export function markPlanStepCompleted(input: {
  session_id: string;
  step_id: string;
  outcome_id?: string;
  evidence?: string[];
}): VisiblePlanArtifact | null {
  const plan = getVisiblePlan(input.session_id);
  if (!plan) return null;
  const now = new Date().toISOString();
  const next = {
    ...plan,
    updated_at: now,
    steps: plan.steps.map((step) => step.id === input.step_id
      ? {
          ...step,
          status: "completed" as const,
          completed_by_outcome_id: input.outcome_id,
          completed_at: now,
          evidence: [...(step.evidence ?? []), ...(input.evidence ?? [])],
        }
      : step),
  };
  return upsertVisiblePlan(next);
}

export function listVisiblePlans(): VisiblePlanArtifact[] {
  return [...plansBySession.values()];
}
