import { z } from "zod";

export const MemoryScope = z.enum([
  "user",
  "repo",
  "branch",
  "task",
  "session",
  "executor",
  "global_policy",
]);

export const MemoryKind = z.enum(["observation", "summary", "prompt", "manual"]);

export const MemoryWriteInput = z.object({
  scope: MemoryScope,
  scope_id: z.string().default(""),
  content: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
  kind: MemoryKind.default("manual"),
  facts: z.array(z.string()).default([]),
  concepts: z.array(z.string()).default([]),
  files_read: z.array(z.string()).default([]),
  files_modified: z.array(z.string()).default([]),
});

export const MemorySearchInput = z.object({
  query: z.string().min(1),
  scope: MemoryScope.optional(),
  scope_id: z.string().optional(),
  filters: z.record(z.unknown()).default({}),
  limit: z.number().int().min(1).max(100).default(10),
});

export const MemoryExtractInput = z.object({
  session_id: z.string(),
  text: z.string().min(1),
});

export const MemoryPromoteInput = z.object({
  memory_id: z.string(),
  target_scope: MemoryScope,
  target_scope_id: z.string().default(""),
});

export const MemoryPatchInput = z.object({
  content: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  kind: MemoryKind.optional(),
  facts: z.array(z.string()).optional(),
  concepts: z.array(z.string()).optional(),
  files_read: z.array(z.string()).optional(),
  files_modified: z.array(z.string()).optional(),
});

export const MemoryExtractionResult = z.object({
  candidates: z.array(
    z.object({
      content: z.string().min(1),
      confidence: z.number().min(0).max(1),
      scope: MemoryScope.optional(),
    }),
  ),
});

export type MemoryExtractionResultType = z.infer<typeof MemoryExtractionResult>;
export type MemoryKindType = z.infer<typeof MemoryKind>;
export type MemoryWriteInputType = z.infer<typeof MemoryWriteInput>;
export type MemorySearchInputType = z.infer<typeof MemorySearchInput>;
export type MemoryExtractInputType = z.infer<typeof MemoryExtractInput>;
export type MemoryPromoteInputType = z.infer<typeof MemoryPromoteInput>;
export type MemoryPatchInputType = z.infer<typeof MemoryPatchInput>;
