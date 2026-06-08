/**
 * Zod schemas for LLM-first action planning.
 *
 * Three plan modes:
 *   finite     — bounded sequence with a known end
 *   loop       — repeat until platform stops, user stops, or goal satisfied
 *   open_ended — ongoing autonomous work with periodic checkpoints
 *
 * These schemas validate LLM output deterministically after generation.
 * They do NOT enforce execution safety — that belongs in jubilant-goggles.
 */

import { z } from "zod";

// ── Plan step ───────────────────────────────────────────────────────

export const PlanStepSchema = z.object({
  action_name: z.string().min(1),
  params: z.record(z.unknown()).default({}),
  rationale: z.string().optional(),
  requires_platform_validation: z.literal(true).default(true),
});

export type PlanStep = z.infer<typeof PlanStepSchema>;

// ── Plan modes ──────────────────────────────────────────────────────

export const PlanModeSchema = z.enum(["finite", "loop", "open_ended"]);

export type PlanMode = z.infer<typeof PlanModeSchema>;

// ── Full plan output (LLM response shape) ───────────────────────────

export const ActionPlanOutputSchema = z.object({
  plan: z.object({
    goal: z.string().min(1),
    mode: PlanModeSchema,
    steps: z.array(PlanStepSchema).min(1),
    loop_condition: z.string().optional(),
  }),
});

export type ActionPlanOutput = z.infer<typeof ActionPlanOutputSchema>;

// ── Plan request (POST /actions/plan input) ─────────────────────────

export const LLMPlanRequestSchema = z.object({
  session_id: z.string().min(1),
  repo_id: z.string().optional(),
  prompt: z.string().min(1),
  allowed_actions: z.array(z.string()).min(1),
  mode_preference: PlanModeSchema.optional(),
  recent_memories: z.array(z.record(z.unknown())).default([]),
  context_summaries: z.array(z.string()).default([]),
  recent_action_outcomes: z.array(z.record(z.unknown())).default([]),
});

export type LLMPlanRequest = z.infer<typeof LLMPlanRequestSchema>;

// ── Validate-plan request (POST /actions/validate-plan input) ───────

export const ValidatePlanRequestSchema = z.object({
  session_id: z.string().optional(),
  allowed_actions: z.array(z.string()).min(1),
  plan: z.object({
    goal: z.string().min(1),
    mode: PlanModeSchema,
    steps: z.array(PlanStepSchema).min(1),
    loop_condition: z.string().optional(),
  }),
});

export type ValidatePlanRequest = z.infer<typeof ValidatePlanRequestSchema>;

// ── Plan response shape ─────────────────────────────────────────────

export interface PlanResponse {
  ok: boolean;
  plan: ActionPlanOutput["plan"] | null;
  schema_valid: boolean;
  requires_platform_validation: true;
  source: string;
  warnings: PlanWarning[];
  errors: string[];
}

export interface PlanWarning {
  source: string;
  message: string;
}

// ── Validation result ───────────────────────────────────────────────

export interface PlanValidationResult {
  valid: boolean;
  errors: string[];
  warnings: PlanWarning[];
}
