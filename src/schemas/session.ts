import { z } from "zod";

export const SessionCreateInput = z.object({
  repo_id: z.string().optional(),
});

export const SessionEventInput = z.object({
  event_type: z.string().min(1),
  data: z.record(z.unknown()).default({}),
});

export type SessionCreateInputType = z.infer<typeof SessionCreateInput>;
export type SessionEventInputType = z.infer<typeof SessionEventInput>;
