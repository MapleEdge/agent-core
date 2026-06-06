import { z } from "zod";

export const PolicyMatchInput = z.object({
  action_name: z.string(),
  scope: z.string().default("global"),
  context: z.record(z.unknown()).default({}),
});

export const PolicyCheckInput = z.object({
  session_id: z.string(),
  action_name: z.string(),
  params: z.record(z.unknown()).default({}),
});

export const ApprovalRequestInput = z.object({
  session_id: z.string(),
  action_name: z.string(),
  reason: z.string(),
  params: z.record(z.unknown()).default({}),
});

export const PolicyCheckResult = z.object({
  allowed: z.boolean(),
  requires_approval: z.boolean(),
  approval_type: z.string().nullable(),
  reason: z.string(),
  matched_rules: z.array(z.string()),
});

export type PolicyMatchInputType = z.infer<typeof PolicyMatchInput>;
export type PolicyCheckInputType = z.infer<typeof PolicyCheckInput>;
export type ApprovalRequestInputType = z.infer<typeof ApprovalRequestInput>;
export type PolicyCheckResultType = z.infer<typeof PolicyCheckResult>;
