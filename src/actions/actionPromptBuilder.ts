/**
 * Builds the LLM prompt for action planning.
 *
 * The prompt includes:
 *   - Session context (session_id, repo_id, allowed_actions)
 *   - Action catalog from canonical source (schemas, risk, guidance)
 *   - Sample templates (examples, not constraints)
 *   - Recent memories and context summaries
 *   - Recent action outcomes (trajectory feedback)
 *   - Mode preference hint
 *   - Strict JSON output schema
 */

import type { ActionDefinition } from "../providers/ActionKnowledgeProvider.js";
import type { SampleTemplate } from "./sampleTemplates.js";
import type { LLMMessage } from "../llm/LLMClient.js";
import { CANONICAL_ACTION_MAP } from "./catalog/canonicalActions.js";

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
  max_iterations?: number;
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

  parts.push(`You are the advisory action planner for agent-core.

agent-core owns memory, context, and action knowledge. It does NOT own execution, policy, worktrees, commits, approvals, or runtime safety. Those belong to jubilant-goggles.

Your job: given a user prompt and a set of session-visible actions, produce an advisory action plan as strict JSON.

The plan must be useful to an executor, but it is not authorization. Every step must require platform validation.

## Core Rules

1. You may ONLY use actions from the provided catalog. Never invent action names.
2. Every step MUST have "requires_platform_validation": true.
3. The plan must have a "goal", "mode", and "steps" array.
4. Mode must be one of: "finite", "loop", "open_ended".
   - "finite": bounded sequence with a known end.
   - "loop": repeat bounded iterations until stopped by the platform, the user, a guard, or goal satisfaction.
   - "open_ended": ongoing autonomous work with periodic checkpoints, validation, trace reporting, and plan refreshes.
5. For "loop" and "open_ended" modes, include a "loop_condition" string.
6. The executor has a budget of ${input.max_iterations ?? 50} iterations. Each plan step costs at least one iteration, and complex steps (e.g. autonomous_code_edit, investigate_and_patch) may consume multiple iterations internally. Plan accordingly — keep plans focused within this budget. Do NOT pad with unnecessary steps, but do NOT artificially truncate a plan that genuinely needs more steps.
7. "commit" may appear ONLY if "commit" is in the catalog AND the user explicitly requested commit-capable work.
8. If "commit" appears, it only means "recommend commit"; jubilant-goggles decides whether commit is allowed and performs it.
9. "merge_pr" may appear ONLY if "merge_pr" is in the catalog. Check CI status first unless user override says skip.
10. Respond with ONLY valid JSON matching the output schema. No markdown, no commentary.
11. Never include raw secrets, tokens, or credentials in params. Use secret_ref fields.
12. Never include raw chain-of-thought in output.

## Critical Plan Quality Rules

13. "goal" must be a SHORT description of what the plan achieves. Do NOT copy the user prompt into goal.
14. "grep" params.pattern must be a real code/repo search pattern, such as a class, function, symbol, route, provider name, endpoint, config key, or vendor symbol. Do NOT grep random words from the user's instruction.
15. Do not invent file paths.
16. A "read_file" path may only be:
    - explicitly provided by the user,
    - present in Context Summaries,
    - a stable root/config/documentation path such as README.md, package.json, pyproject.toml, Cargo.toml, go.mod, AGENTS.md, CLAUDE.md, tsconfig.json, vite.config.ts, vitest.config.ts,
    - or discovered by a prior grep/list_files-style step.
17. If unsure where a file lives, use grep or list_files first. Do not read a guessed path.
18. Never use an empty read_file path.
19. For implementation tasks, gather evidence before editing.
20. Do not use apply_patch before reading the current implementation or relevant interface.
21. Do not produce a read-only plan for an implementation request unless the user explicitly asks only for an audit.
22. For implementation tasks, the normal workflow is:
    explore/retrieve/search -> read current implementation -> read relevant contracts/tests -> edit tests or implementation -> run tests -> summarize_diff.
23. "run_tests" should appear after an edit step unless the goal is explicitly to establish a baseline or reproduce a failure (use purpose="baseline").
24. "summarize_diff" should appear before completion of any implementation plan.
25. "apply_patch" params must include either:
    - "patch": string,
    - or "path" + "intent": string describing the exact intended change.
    Prefer also including "evidence": string[] when editing from reference/vendor behavior.
26. Do not output placeholders like "<actual file>" or "<path found by grep>" as read_file/apply_patch paths. If a concrete path is unknown, plan a grep/list_files step instead.
27. "record_skipped_validation" should appear whenever a validation step is intentionally skipped.

## PlanStep Schema

Each step may include these fields:
- id (optional): unique step identifier
- title (optional): short human-readable title for UI rendering
- action_name (required): must be from the catalog
- params (required): must match the action's schema
- rationale (optional): visible reason for this step
- expected_result (optional): what this step should produce
- requires_platform_validation: true (required)
- can_retry (optional): whether this step can be retried on failure
- on_failure (optional): "stop" | "skip" | "retry" | "ask_user"
- ui_event_hint (optional): hint for the UI on how to render this step`);

  // Action catalog with canonical metadata
  parts.push("\n## Available Actions\n");
  parts.push("```json");
  const catalogEntries = input.action_catalog
    .filter((a) => input.allowed_actions.includes(a.name))
    .map((a) => {
      const canonical = CANONICAL_ACTION_MAP.get(a.name);
      return {
        name: a.name,
        description: a.description,
        params_json_schema: a.params_json_schema,
        risk: canonical?.risk ?? a.risk,
        side_effects: canonical?.side_effects ?? a.side_effects,
        requires_approval: canonical?.requires_approval ?? false,
        planner_guidance: canonical?.planner_guidance ?? "",
      };
    });
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

  parts.push(`\n## Required Output Schema

\`\`\`json
{
  "plan": {
    "goal": "Short description of what this plan achieves, not the user prompt",
    "mode": "finite | loop | open_ended",
    "steps": [
      {
        "id": "optional unique id",
        "title": "optional short title",
        "action_name": "string, must be from available actions",
        "params": { "key": "value, must be valid for the action schema" },
        "rationale": "Visible, concise reason for the step",
        "expected_result": "optional description of expected output",
        "requires_platform_validation": true,
        "can_retry": true,
        "on_failure": "stop | skip | retry | ask_user",
        "ui_event_hint": "optional UI hint"
      }
    ],
    "loop_condition": "string, required for loop/open_ended modes"
  }
}
\`\`\`

Important:
- Respond with ONLY the JSON plan. No other text.
- If exact files are unknown, use inspect_repo, search_code, grep, or list_files first.
- For implementation tasks: inspect/search/read before edit, validate after edit.
- summarize_diff before commit.
- check_ci_status before merge unless user override says skip.
- record_skipped_validation when validation is skipped.
- No raw secrets. No raw chain-of-thought.`);

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
