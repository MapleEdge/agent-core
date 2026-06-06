import { z } from "zod";

export const ContextSearchInput = z.object({
  repo_id: z.string(),
  query: z.string().min(1),
  path: z.string().optional(),
});

export const ContextLinkInput = z.object({
  source_repo: z.string(),
  source_path: z.string(),
  target_repo: z.string(),
  target_path: z.string(),
  relation: z.string().default("related"),
});

export const ContextPromoteInput = z.object({
  repo_id: z.string(),
  path: z.string(),
  content: z.string(),
});

export type ContextSearchInputType = z.infer<typeof ContextSearchInput>;
export type ContextLinkInputType = z.infer<typeof ContextLinkInput>;
export type ContextPromoteInputType = z.infer<typeof ContextPromoteInput>;
