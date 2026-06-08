/**
 * Builds the LLM prompt for action planning.
 *
 * The prompt includes:
 *   - Session context (session_id, repo_id, allowed_actions)
 *   - Action catalog (only session-visible actions, with JSON Schema)
 *   - Sample templates (examples, not constraints)
 *   - Recent memories and context summaries
 *   - Recent action outcomes (trajectory feedback)
 *   - Mode preference hint
 *   - Strict JSON output schema
 */

import type { ActionDefinition } from "../providers/ActionKnowledgeProvider.js";
import type { SampleTemplate } from "./sampleTemplates.js";
import type { LLMMessage } from "../llm/LLMClient.js";

export interface PlanPromptInput {
  user_prompt: string;
  session_id: string;
  repo_id?: string;
  allowed_actions: string[];
  action_catalog: ActionDefinition[];
  sample_templates: SampleTemplate[];
  recent_memories: Record<string, unknown>[];
  context_summaries: string[];
  recent_action_outcomes: Record<string, unknown>[];
  mode_preference?: string;
}

export function buildPlanPrompt(input: PlanPromptInput): LLMMessage[] {
  const system = buildSystemMessage(input);
  const user = buildUserMessage(input);
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function buildSystemMessage(input: PlanPromptInput): string {
  const parts: string[] = [];

  parts.push(`You are an action planner for an AI coding agent operating within agent-core.

agent-core owns memory, context, and action knowledge. It does NOT own execution, policy, worktrees, commits, or approvals — those belong to the platform.

Your job: given a user prompt and a set of available actions, produce an EXECUTABLE action plan as strict JSON.

## Rules

1. You may ONLY use actions from the provided catalog. Never invent action names.
2. Every step MUST have "requires_platform_validation": true.
3. The plan must have a "goal", "mode", and "steps" array.
4. Mode must be one of: "finite", "loop", "open_ended".
   - "finite": bounded sequence with a known end
   - "loop": repeat until stopped by platform, user, or goal satisfied
   - "open_ended": ongoing autonomous work with periodic checkpoints
5. For "loop" and "open_ended" modes, include a "loop_condition" string.
6. Do NOT impose an artificial maximum number of steps.
7. "commit" may appear in the plan ONLY if "commit" is in the catalog.
8. Respond with ONLY valid JSON matching the output schema. No markdown, no explanation.

## Critical: Plan Quality Rules

9. "goal" must be a SHORT description of what the plan achieves. Do NOT copy the user prompt into goal.
10. "grep" params.pattern must be a real code pattern (function name, class, import, etc.), NOT words from the user's instruction.
11. "read_file" params.path must be a plausible file path (e.g., "src/index.ts", "package.json"). NEVER use empty string.
12. "run_tests" must ONLY appear AFTER at least one edit action (apply_patch or write_file). Never run tests before making changes.
13. Steps must follow the implementation workflow: explore (grep/read_file) → edit (apply_patch/write_file) → validate (run_tests) → summarize (summarize_diff).
14. For implementation tasks, the plan must include concrete edit steps. Do NOT produce a read-only plan for an implementation request.
15. When unsure about exact file paths, use grep first to discover them, then read_file, then edit.`);

  // Action catalog
  parts.push("\n## Available Actions\n");
  parts.push("```json");
  const catalogEntries = input.action_catalog
    .filter((a) => input.allowed_actions.includes(a.name))
    .map((a) => ({
      name: a.name,
      description: a.description,
      params_json_schema: a.params_json_schema,
      risk: a.risk,
      side_effects: a.side_effects,
    }));
  parts.push(JSON.stringify(catalogEntries, null, 2));
  parts.push("```");

  // Sample templates
  if (input.sample_templates.length > 0) {
    parts.push("\n## Sample Plan Templates (examples, not constraints)\n");
    parts.push("```json");
    const templates = input.sample_templates
      .filter((t) => t.steps.every((s) => input.allowed_actions.includes(s)));
    parts.push(JSON.stringify(templates, null, 2));
    parts.push("```");
  }

  // Output schema
  parts.push(`\n## Required Output Schema

\`\`\`json
{
  "plan": {
    "goal": "Short description of what this plan achieves (NOT the user prompt)",
    "mode": "finite | loop | open_ended",
    "steps": [
      {
        "action_name": "string — must be from available actions",
        "params": { "key": "value — must be valid for the action schema" },
        "rationale": "string — why this step",
        "requires_platform_validation": true
      }
    ],
    "loop_condition": "string — required for loop/open_ended modes"
  }
}
\`\`\`

## Example: Implementation Task

If the user asks to "implement X", a valid plan looks like:
\`\`\`json
{
  "plan": {
    "goal": "Implement X feature",
    "mode": "finite",
    "steps": [
      { "action_name": "grep", "params": { "pattern": "ExistingInterface|relatedFunction" }, "rationale": "Find existing code related to X", "requires_platform_validation": true },
      { "action_name": "read_file", "params": { "path": "src/providers/SomeProvider.ts" }, "rationale": "Read current implementation", "requires_platform_validation": true },
      { "action_name": "apply_patch", "params": { "file": "src/providers/NewProvider.ts" }, "rationale": "Create new provider", "requires_platform_validation": true },
      { "action_name": "apply_patch", "params": { "file": "src/routes/new.ts" }, "rationale": "Add endpoints", "requires_platform_validation": true },
      { "action_name": "run_tests", "params": {}, "rationale": "Validate changes", "requires_platform_validation": true },
      { "action_name": "summarize_diff", "params": {}, "rationale": "Review changes", "requires_platform_validation": true }
    ]
  }
}
\`\`\``);

  return parts.join("\n");
}

function buildUserMessage(input: PlanPromptInput): string {
  const parts: string[] = [];

  parts.push(`## User Request\n\n${input.user_prompt}`);

  parts.push(`\n## Session\n\nsession_id: ${input.session_id}`);
  if (input.repo_id) parts.push(`repo_id: ${input.repo_id}`);
  parts.push(`allowed_actions: ${JSON.stringify(input.allowed_actions)}`);

  if (input.mode_preference) {
    parts.push(`\nPreferred mode: ${input.mode_preference}`);
  }

  if (input.recent_memories.length > 0) {
    parts.push("\n## Recent Memories\n");
    parts.push("```json");
    parts.push(JSON.stringify(input.recent_memories.slice(0, 10), null, 2));
    parts.push("```");
  }

  if (input.context_summaries.length > 0) {
    parts.push("\n## Context Summaries\n");
    for (const summary of input.context_summaries.slice(0, 5)) {
      parts.push(`- ${summary}`);
    }
  }

  if (input.recent_action_outcomes.length > 0) {
    parts.push("\n## Recent Action Outcomes\n");
    parts.push("```json");
    parts.push(JSON.stringify(input.recent_action_outcomes.slice(0, 10), null, 2));
    parts.push("```");
  }

  parts.push("\n\nRespond with ONLY the JSON plan. No other text.");

  return parts.join("\n");
}
