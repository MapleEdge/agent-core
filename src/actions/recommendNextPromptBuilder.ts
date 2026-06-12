import type { ActionDefinition, ActionRecommendationContext } from "../providers/ActionKnowledgeProvider.js";

export interface RecommendNextPromptSource {
  name: string;
  priority: number;
  content: unknown;
}

export interface RecommendNextPromptInput {
  context: ActionRecommendationContext;
  action_catalog: ActionDefinition[];
  active_plan?: unknown;
  suggested_plan?: unknown;
  recent_outcomes?: unknown[];
  memories?: unknown[];
  session_graph_projection?: unknown;
  additional_sources?: RecommendNextPromptSource[];
}

export interface RecommendNextPromptMessages {
  messages: Array<{ role: "system" | "user"; content: string }>;
  sources: RecommendNextPromptSource[];
}

function safeJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

function clip(value: string, max = 5000): string {
  return value.length > max ? `${value.slice(0, max)}\n...<truncated>` : value;
}

export function buildRecommendNextPrompt(input: RecommendNextPromptInput): RecommendNextPromptMessages {
  const sources: RecommendNextPromptSource[] = [
    { name: "current_context", priority: 100, content: input.context },
    { name: "action_catalog", priority: 90, content: input.action_catalog.map((action) => ({ name: action.name, description: action.description, risk: action.risk, side_effects: action.side_effects, params_json_schema: action.params_json_schema })) },
    { name: "active_visible_plan", priority: 80, content: input.active_plan ?? null },
    { name: "suggested_plan", priority: 70, content: input.suggested_plan ?? null },
    { name: "recent_outcomes", priority: 60, content: input.recent_outcomes ?? [] },
    { name: "memories", priority: 50, content: input.memories ?? [] },
    { name: "session_graph_projection", priority: 40, content: input.session_graph_projection ?? null },
    ...(input.additional_sources ?? []),
  ].sort((a, b) => b.priority - a.priority);

  const sourceText = sources.map((source) => `## ${source.name}\n${clip(safeJson(source.content))}`).join("\n\n");

  return {
    sources,
    messages: [
      {
        role: "system",
        content: [
          "You are the recommend-next engine for an autonomous coding platform.",
          "Choose exactly one next action. Do not return a multi-step plan.",
          "The visible plan is advisory UI state. It may guide you, but execution must follow your single next-action decision.",
          "If your selected action deviates from the active or suggested plan, set requires_plan_revision=true and explain why.",
          "Return strict JSON with action_name, params, confidence, rationale, plan_alignment, aligned_plan_step_ids, deviation_reason, requires_plan_revision.",
        ].join("\n"),
      },
      {
        role: "user",
        content: sourceText,
      },
    ],
  };
}
