/**
 * Zod schemas for registered actions.
 *
 * Each action defines its parameter schema using Zod. The pipeline's
 * validate stage runs safeParse() against these schemas before invocation.
 *
 * Reference: Letta tool_manager.create_tool() — extracts parameter schemas
 * from Python type hints and JSON schema. We use Zod directly since we're
 * in TypeScript.
 */

import { z, type ZodType } from "zod";

/** Runtime-registered Zod schemas, keyed by action name. */
const actionZodSchemas = new Map<string, ZodType>();

export function registerActionSchema(name: string, schema: ZodType): void {
  actionZodSchemas.set(name, schema);
}

export function getActionSchema(name: string): ZodType | undefined {
  return actionZodSchemas.get(name);
}

export function hasActionSchema(name: string): boolean {
  return actionZodSchemas.has(name);
}

export function resetActionSchemas(): void {
  actionZodSchemas.clear();
}

/**
 * Default Zod schemas for built-in actions.
 *
 * These define the parameter contracts that the validate stage enforces.
 */
export const ACTION_ZOD_SCHEMAS: Record<string, ZodType> = {
  classify_task: z.object({
    task_type: z.string().optional(),
    prompt: z.string().optional(),
  }),

  read_file: z.object({
    path: z.string().min(1),
  }),

  grep: z.object({
    pattern: z.string().min(1),
    path: z.string().optional(),
  }),

  write_file: z.object({
    path: z.string().min(1),
    content: z.string(),
  }),

  run_tests: z.object({
    suite: z.string().optional(),
    filter: z.string().optional(),
  }),

  summarize_diff: z.object({
    base: z.string().optional(),
    head: z.string().optional(),
  }),

  request_approval: z.object({
    action: z.string().min(1),
    reason: z.string().optional(),
  }),

  commit: z.object({
    message: z.string().min(1),
    files: z.array(z.string()).optional(),
  }),

  search_memory: z.object({
    query: z.string().min(1),
    scope: z.string().optional(),
  }),

  retrieve_context: z.object({
    repo_id: z.string().optional(),
    path: z.string().optional(),
  }),
};

/** Register all default Zod schemas. */
export function seedActionSchemas(): void {
  for (const [name, schema] of Object.entries(ACTION_ZOD_SCHEMAS)) {
    registerActionSchema(name, schema);
  }
}
