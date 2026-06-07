import { z } from "zod";

export const SessionCreateInput = z.object({
  repo_id: z.string().optional(),
});

export const SessionEventInput = z.object({
  event_type: z.string().min(1),
  data: z.record(z.unknown()).default({}),
});

export const SessionListInput = z.object({
  status: z.string().optional(),
  repo_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const SessionCloseInput = z.object({
  summary: z.string().optional(),
});

export type SessionCreateInputType = z.infer<typeof SessionCreateInput>;
export type SessionEventInputType = z.infer<typeof SessionEventInput>;
export type SessionListInputType = z.infer<typeof SessionListInput>;
export type SessionCloseInputType = z.infer<typeof SessionCloseInput>;
