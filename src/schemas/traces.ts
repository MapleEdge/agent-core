import { z } from "zod";

export const ToolCallTraceInput = z.object({
  session_id: z.string(),
  action_name: z.string(),
  input: z.record(z.unknown()).default({}),
  output: z.record(z.unknown()).default({}),
  duration_ms: z.number().int().optional(),
});

export const SkillRunTraceInput = z.object({
  session_id: z.string(),
  skill_name: z.string(),
  input: z.record(z.unknown()).default({}),
  output: z.record(z.unknown()).default({}),
  duration_ms: z.number().int().optional(),
});

export type ToolCallTraceInputType = z.infer<typeof ToolCallTraceInput>;
export type SkillRunTraceInputType = z.infer<typeof SkillRunTraceInput>;
