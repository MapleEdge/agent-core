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
6. Do NOT impose an artificial maximum number of steps.
7. "commit" may appear ONLY if "commit" is in the catalog AND the user explicitly requested commit-capable work.
8. If "commit" appears, it only means "recommend commit"; jubilant-goggles decides whether commit is allowed and performs it.
9. Respond with ONLY valid JSON matching the output schema. No markdown, no commentary.

## Critical Plan Quality Rules

10. "goal" must be a SHORT description of what the plan achieves. Do NOT copy the user prompt into goal.
11. "grep" params.pattern must be a real code/repo search pattern, such as a class, function, symbol, route, provider name, endpoint, config key, or vendor symbol. Do NOT grep random words from the user's instruction.
12. Do not invent file paths.
13. A "read_file" path may only be:
    - explicitly provided by the user,
    - present in Context Summaries,
    - a stable root/config/documentation path such as README.md, package.json, pyproject.toml, Cargo.toml, go.mod, AGENTS.md, CLAUDE.md, tsconfig.json, vite.config.ts, vitest.config.ts,
    - or discovered by a prior grep/list_files-style step.
14. If unsure where a file lives, use grep first. Do not read a guessed path.
15. Never use an empty read_file path.
16. For implementation tasks, gather evidence before editing.
17. Do not use apply_patch before reading the current implementation or relevant interface.
18. Do not produce a read-only plan for an implementation request unless the user explicitly asks only for an audit.
19. For implementation tasks, the normal workflow is:
    explore/retrieve/search -> read current implementation -> read relevant contracts/tests -> edit tests or implementation -> run tests -> summarize_diff.
20. "run_tests" should appear after an edit step unless the goal is explicitly to establish a baseline or reproduce a failure.
21. "summarize_diff" should appear before completion of any implementation plan.
22. "apply_patch" params must include either:
    - "patch": string,
    - or "intent": string describing the exact intended change.
    Prefer also including "evidence": string[] when editing from reference/vendor behavior.
23. Do not output placeholders like "<actual file>" or "<path found by grep>" as read_file/apply_patch paths. If a concrete path is unknown, plan a grep/list_files step instead.

## Provider / Vendor / Reference Parity Rules

If the prompt involves a provider, adapter, vendored implementation, reference implementation, or phrases such as "match vendor", "same as vendor", "parity", "fully implement provider", "continuous improve provider", or "until it matches vendor functionality", use a provider-parity workflow.

Provider-parity workflow requirements:

1. retrieve_context first, if available.
2. search_memory second, if available.
3. grep/list_files for the current internal implementation and interface.
4. grep/list_files for concrete vendor/reference symbols.
5. read_file for the current internal implementation only after it has been located or is present in context.
6. read_file for the provider interface or route/schema contract.
7. read_file for actual vendor/reference files found by grep/list_files or present in context.
8. grep/list_files for existing tests.
9. apply_patch to tests first, with intent.
10. apply_patch to implementation second, with intent and evidence.
11. run_tests, preferably targeted first.
12. summarize_diff with remaining parity gaps and the next recommended slice.

For broad requests like "match vendor functionality", "fully implement", "continuous improve", or "until parity":
- Do NOT claim full parity in one edit.
- Implement one bounded capability slice per iteration.
- The loop condition must say that jubilant-goggles should refresh context and request the next plan after the checkpoint.
- If tests fail twice, vendor behavior is ambiguous, or required API contracts are missing, stop and summarize the blocker.

Hard prohibitions for provider-parity tasks:

- Do not invent generic vendor files such as "src/vendor/VendorContextProvider.ts".
- Do not invent provider files such as "src/providers/OpenVikingContextProvider.ts" unless they are present in context or found by search.
- Do not use apply_patch before reading both the current internal implementation/interface and the concrete vendor/reference implementation.
- Do not use vague apply_patch params like { "file": "..." } without intent or patch.

## OpenViking-Specific Planning Rules

If the prompt mentions OpenViking, OpenVikingContextProvider, ContextProvider, context provider, or vendor context provider, search for these internal symbols:

- ContextProvider
- OpenViking
- context/search
- context/repos
- relations
- link
- unlink
- tree
- nodes

Search for these vendor/reference symbols:

- VikingFS
- HierarchicalRetriever
- relations
- link
- unlink
- overview
- abstract
- find
- search
- ServicePlugin
- recursive
- rerank
- hotness

For OpenViking parity, use this capability checklist:

- repo context tree
- node CRUD
- overview or abstract summaries
- relations link/unlink/list
- scoped context search
- hierarchical retrieval
- recursive child expansion
- relation expansion
- score propagation or reranking hooks
- hotness or recency scoring
- backend/plugin separation
- metadata filters
- no cross-repo leakage tests

Pick one capability slice per iteration unless the user asks only for an audit.`);

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

  parts.push(`\n## Required Output Schema

\`\`\`json
{
  "plan": {
    "goal": "Short description of what this plan achieves, not the user prompt",
    "mode": "finite | loop | open_ended",
    "steps": [
      {
        "action_name": "string, must be from available actions",
        "params": { "key": "value, must be valid for the action schema" },
        "rationale": "Visible, concise reason for the step",
        "requires_platform_validation": true
      }
    ],
    "loop_condition": "string, required for loop/open_ended modes"
  }
}
\`\`\`

## Good Example: Provider Parity Task

If the user asks to improve a provider until it matches a vendor/reference implementation, a valid plan should look like this pattern. Adapt actions and paths to the actual allowed catalog and known context.

\`\`\`json
{
  "plan": {
    "goal": "Improve ContextProvider toward OpenViking parity by implementing one tested capability slice",
    "mode": "loop",
    "steps": [
      {
        "action_name": "retrieve_context",
        "params": {
          "query": "OpenViking ContextProvider current implementation interface vendor files tests and prior architecture decisions"
        },
        "rationale": "Load architecture context and avoid inventing provider paths.",
        "requires_platform_validation": true
      },
      {
        "action_name": "search_memory",
        "params": {
          "query": "OpenViking ContextProvider provider parity previous implementation notes"
        },
        "rationale": "Recover prior decisions about provider responsibilities.",
        "requires_platform_validation": true
      },
      {
        "action_name": "grep",
        "params": {
          "pattern": "OpenVikingContextProvider|ContextProvider|context/search|context/repos|relations|link|unlink|tree|nodes"
        },
        "rationale": "Locate the current internal context provider, routes, schemas, and tests before reading files.",
        "requires_platform_validation": true
      },
      {
        "action_name": "grep",
        "params": {
          "pattern": "VikingFS|HierarchicalRetriever|relations|link|unlink|overview|abstract|find|search|ServicePlugin|recursive|rerank|hotness"
        },
        "rationale": "Locate concrete OpenViking vendor reference files before reading vendor code.",
        "requires_platform_validation": true
      },
      {
        "action_name": "grep",
        "params": {
          "pattern": "describe\\\\(|it\\\\(|ContextProvider|OpenViking|relations|context search|repo context"
        },
        "rationale": "Find existing tests and identify where to add characterization coverage.",
        "requires_platform_validation": true
      },
      {
        "action_name": "apply_patch",
        "params": {
          "file": "tests/context-provider.test.ts",
          "intent": "Add characterization tests for one missing OpenViking-inspired capability slice, using actual provider contracts and vendor behavior discovered by earlier search/read steps.",
          "evidence": [
            "current ContextProvider interface",
            "OpenViking vendor relation/search behavior"
          ]
        },
        "rationale": "Create an objective parity target before changing implementation.",
        "requires_platform_validation": true
      },
      {
        "action_name": "apply_patch",
        "params": {
          "file": "src/providers/ContextProvider.ts",
          "intent": "Implement the tested OpenViking-inspired capability slice without adding execution authority to agent-core.",
          "evidence": [
            "current ContextProvider interface",
            "OpenViking vendor relation/search behavior",
            "new characterization tests"
          ]
        },
        "rationale": "Improve provider parity in one bounded and reviewable increment.",
        "requires_platform_validation": true
      },
      {
        "action_name": "run_tests",
        "params": {
          "target": "context provider tests"
        },
        "rationale": "Validate the provider parity slice and catch regressions.",
        "requires_platform_validation": true
      },
      {
        "action_name": "summarize_diff",
        "params": {
          "include_remaining_gaps": true
        },
        "rationale": "Summarize the implemented capability slice, validation evidence, and remaining parity gaps.",
        "requires_platform_validation": true
      }
    ],
    "loop_condition": "After each bounded parity slice, jubilant-goggles should refresh context and request the next plan only if tests pass, useful parity gaps remain, and platform policy allows continued work."
  }
}
\`\`\`

Important:
- The example is a pattern. Do not reuse example file paths unless they are known to exist.
- If exact files are unknown, use grep/list_files first.
- Respond with ONLY the JSON plan. No other text.`);

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
