import { z } from "zod";

export const ToolSequenceInput = z.object({
  task_type: z.string().min(1),
  sequence: z.array(z.string()),
  before_exit: z.array(z.string()).default([]),
  approval_required: z.array(z.string()).default([]),
  conditions: z.record(z.unknown()).default({}),
});

export const AllowedNextInput = z.object({
  task_type: z.string().min(1),
  current_action: z.string().nullish(),
  completed_actions: z.array(z.string()).default([]),
  available_actions: z.array(z.string()).optional(),
  last_function_response: z.string().optional(),
});

export const ValidateSequenceInput = z.object({
  task_type: z.string().min(1),
  proposed_sequence: z.array(z.string()),
});

export type ToolSequenceInputType = z.infer<typeof ToolSequenceInput>;
export type AllowedNextInputType = z.infer<typeof AllowedNextInput>;
export type ValidateSequenceInputType = z.infer<typeof ValidateSequenceInput>;
