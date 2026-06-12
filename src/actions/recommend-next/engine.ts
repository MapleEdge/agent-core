import type { LLMClient } from "../../llm/LLMClient.js";
import type { ActionDefinition, ActionKnowledgeProvider, ActionRecommendation, ActionRecommendationContext } from "../../providers/ActionKnowledgeProvider.js";
import { coordinateRecommendNext } from "./planCoordinator.js";
import { buildRecommendNextPrompt } from "./promptBuilder.js";
import type { RecommendNextWithPlanOutput } from "./types.js";

export interface RecommendNextEngineInput {
  context: ActionRecommendationContext;
  provider: ActionKnowledgeProvider;
  llmClient?: LLMClient | null;
  active_plan?: unknown;
  suggested_plan?: unknown;
  recent_outcomes?: unknown[];
  memories?: unknown[];
  session_graph_projection?: unknown;
}

export interface RecommendNextEngineResult {
  recommendation: ActionRecommendation | null;
  recommendations: ActionRecommendation[];
  plan_decision?: RecommendNextWithPlanOutput;
  prompt_messages?: Array<{ role: "system" | "user"; content: string }>;
  active_plan?: unknown;
  suggested_plan?: unknown;
  source: "llm_recommend_next" | "provider_recommend_next";
  advisory_only: true;
  requires_platform_validation: true;
}

function normalizeActionName(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "ask_user";
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function toRecommendation(raw: Record<string, unknown>, catalog: ActionDefinition[]): ActionRecommendation {
  const actionName = normalizeActionName(raw.action_name ?? raw.next_action ?? raw.recommended_action);
  const action = catalog.find((candidate) => candidate.name === actionName);
  return {
    action_name: actionName,
    params: raw.params && typeof raw.params === "object" ? raw.params as Record<string, unknown> : {},
    schema_valid: Boolean(action),
    requires_platform_validation: true,
    requires_approval: false,
    confidence: typeof raw.confidence === "number" ? raw.confidence : typeof raw.certainty === "number" ? raw.certainty : 0.5,
    rationale: typeof raw.rationale === "string" ? raw.rationale : typeof raw.reason === "string" ? raw.reason : "recommend-next selected this action",
  };
}

export async function recommendNext(input: RecommendNextEngineInput): Promise<RecommendNextEngineResult> {
  const catalog = await input.provider.listActions();
  const prompt = buildRecommendNextPrompt({
    context: input.context,
    action_catalog: catalog,
    active_plan: input.active_plan,
    suggested_plan: input.suggested_plan,
    recent_outcomes: input.recent_outcomes,
    memories: input.memories,
    session_graph_projection: input.session_graph_projection,
  });

  if (input.llmClient) {
    try {
      const response = await input.llmClient.complete(prompt.messages);
      const parsed = parseJsonObject(response.content);
      if (parsed) {
        const recommendation = toRecommendation(parsed, catalog);
        const planDecision = coordinateRecommendNext({
          session_id: String(input.context.context.session_id ?? input.context.context["session_id"] ?? "unknown"),
          task_type: input.context.task_type,
          current_action: input.context.current_action,
          completed_actions: input.context.completed_actions,
          context: input.context.context,
          active_plan: input.active_plan as never,
          suggested_plan: input.suggested_plan as never,
          recent_action_outcomes: (input.recent_outcomes ?? []) as Record<string, unknown>[],
        }, parsed);
        return {
          recommendation,
          recommendations: [recommendation],
          plan_decision: planDecision,
          prompt_messages: prompt.messages,
          active_plan: input.active_plan,
          suggested_plan: input.suggested_plan,
          source: "llm_recommend_next",
          advisory_only: true,
          requires_platform_validation: true,
        };
      }
    } catch {
      // Fall through to provider recommendation. The platform remains advisory-only.
    }
  }

  const recommendations = await input.provider.recommendNextActions(input.context);
  return {
    recommendation: recommendations[0] ?? null,
    recommendations,
    prompt_messages: prompt.messages,
    active_plan: input.active_plan,
    suggested_plan: input.suggested_plan,
    source: "provider_recommend_next",
    advisory_only: true,
    requires_platform_validation: true,
  };
}
