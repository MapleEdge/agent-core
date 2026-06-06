import { z } from "zod";

export const RepoOpenInput = z.object({
  repo_url: z.string(),
  branch: z.string().default("main"),
});

export const WorktreeCreateInput = z.object({
  repo_id: z.string(),
  branch: z.string(),
  session_id: z.string().optional(),
});

export const ExecutorSelectInput = z.object({
  task_type: z.string(),
  complexity_score: z.number().int().min(1).max(100).optional(),
});

export const CommitMockInput = z.object({
  session_id: z.string(),
  repo_id: z.string(),
  message: z.string(),
  files: z.array(z.string()).default([]),
});

export type RepoOpenInputType = z.infer<typeof RepoOpenInput>;
export type WorktreeCreateInputType = z.infer<typeof WorktreeCreateInput>;
export type ExecutorSelectInputType = z.infer<typeof ExecutorSelectInput>;
export type CommitMockInputType = z.infer<typeof CommitMockInput>;
