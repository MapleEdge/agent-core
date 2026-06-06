import { z } from "zod";

export const ClassifyTaskInput = z.object({
  prompt: z.string().min(1),
  repo_id: z.string().optional(),
  context: z.record(z.unknown()).default({}),
});

export const ClassifyResult = z.object({
  intent: z.enum(["ask", "do"]),
  task_type: z.enum([
    "answer",
    "code_edit",
    "debug",
    "test_fix",
    "architecture",
    "provider_setup",
    "deploy",
    "payment_sensitive",
  ]),
  complexity_score: z.number().int().min(1).max(100),
  risk_score: z.number().int().min(1).max(100),
  ambiguity_score: z.number().int().min(1).max(100),
  estimated_steps: z.number().int().min(1),
  requires_approval: z.array(z.string()),
  suggested_sequence: z.array(z.string()),
  reasoning: z.string(),
});

export type ClassifyTaskInputType = z.infer<typeof ClassifyTaskInput>;
export type ClassifyResultType = z.infer<typeof ClassifyResult>;
