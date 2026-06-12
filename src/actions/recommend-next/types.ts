import { z } from "zod";
import type { ActionDefinition, ActionRecommendationContext } from "../../providers/ActionKnowledgeProvider.js";

export interface RecommendNextPromptSource {
  name: string;
  priority: number;
  content: unknown;
}

export interface RecommendNextPromptInput {
  context: ActionRecommendationContext;
  action_catalog: ActionDefinition[];
  active_plan?: unknown;
  suggested_plan?: unknown;
  recent_outcomes?: unknown[];
  memories?: unknown[];
  session_graph_projection?: unknown;
  additional_sources?: RecommendNextPromptSource[];
}

export interface RecommendNextPromptMessages {
  messages: Array<{ role: "system" | "user"; content: string }>;
  sources: RecommendNextPromptSource[];
}

export const PlanUiStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  action_name: z.string().min(1).optional(),
  params_hint: z.record(z.unknown()).default({}),
  status: z.enum(["planned", "active", "completed", "skipped", "blocked", "superseded"]).default("planned"),
  completed_by_outcome_id: z.string().optional(),
  completed_at: z.string().optional(),
  evidence: z.array(z.string()).default([]),
});

export type PlanUiStep = z.infer<typeof PlanUiStepSchema>;

export const VisiblePlanArtifactSchema = z.object({
  id: z.string().min(1),
  session_id: z.string().min(1),
  goal: z.string().min(1),
  status: z.enum(["active", "completed", "stale", "superseded"]).default("active"),
  steps: z.array(PlanUiStepSchema).default([]),
  assumptions: z.array(z.string()).default([]),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type VisiblePlanArtifact = z.infer<typeof VisiblePlanArtifactSchema>;

export const PlanAlignmentSchema = z.enum(["aligned", "partially_aligned", "deviating", "no_active_plan"]);
export type PlanAlignment = z.infer<typeof PlanAlignmentSchema>;

export const RecommendNextWithPlanInputSchema = z.object({
  session_id: z.string().min(1),
  task_type: z.string().default("coding"),
  current_action: z.string().optional(),
  completed_actions: z.array(z.string()).default([]),
  context: z.record(z.unknown()).default({}),
  active_plan: VisiblePlanArtifactSchema.optional(),
  suggested_plan: VisiblePlanArtifactSchema.optional(),
  recent_action_outcomes: z.array(z.record(z.unknown())).default([]),
});

export type RecommendNextWithPlanInput = z.infer<typeof RecommendNextWithPlanInputSchema>;

export const RecommendNextWithPlanOutputSchema = z.object({
  action_name: z.string().min(1),
  params: z.record(z.unknown()).default({}),
  rationale: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.5),
  plan_alignment: PlanAlignmentSchema.default("no_active_plan"),
  aligned_plan_step_ids: z.array(z.string()).default([]),
  deviation_reason: z.string().optional(),
  requires_plan_revision: z.boolean().default(false),
});

export type RecommendNextWithPlanOutput = z.infer<typeof RecommendNextWithPlanOutputSchema>;
