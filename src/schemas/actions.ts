import { z } from "zod";

export const ActionRegisterInput = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  schema: z.record(z.unknown()).default({}),
  risk_level: z.enum(["low", "medium", "high", "critical"]).default("low"),
  requires_approval: z.boolean().default(false),
});

export const ActionValidateInput = z.object({
  action_name: z.string().min(1),
  params: z.record(z.unknown()).default({}),
});

export const ActionExecuteInput = z.object({
  action_name: z.string().min(1),
  params: z.record(z.unknown()).default({}),
  session_id: z.string().optional(),
});

export type ActionRegisterInputType = z.infer<typeof ActionRegisterInput>;
export type ActionValidateInputType = z.infer<typeof ActionValidateInput>;
export type ActionExecuteInputType = z.infer<typeof ActionExecuteInput>;
