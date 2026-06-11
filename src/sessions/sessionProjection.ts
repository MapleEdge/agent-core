import { randomUUID } from "node:crypto";
import type { ContextProjection, MountSessionRequest, ProjectionMode, Session } from "./sessionTypes.js";

function defaultProjectionMode(source: Session, target: Session, request: MountSessionRequest): ProjectionMode {
  if (request.mount_mode === "component") return "api_map";
  if (request.mount_mode === "dependency" || request.mount_mode === "vendor") return "capability_map";
  if (source.kind === "repo" && target.kind === "goal") return "behavior_map";
  if (source.kind === target.kind) return "summary";
  return "summary";
}

export function buildContextProjection(input: {
  source: Session;
  target: Session;
  request: MountSessionRequest;
  now?: string;
}): ContextProjection {
  const projectionMode = defaultProjectionMode(input.source, input.target, input.request);
  const sourceIsBroad = ["repo", "app", "container"].includes(input.source.kind);
  const targetIsFocused = ["goal", "work", "question"].includes(input.target.kind);
  const includeSelectors = sourceIsBroad && targetIsFocused
    ? ["capabilities", "behaviors", "interfaces", "relevant_files", "termination_conditions"]
    : ["summary", "facets", "relationships"];
  const excludeSelectors = sourceIsBroad && targetIsFocused
    ? ["unrelated_ui", "deployment", "plugins", "historical_noise"]
    : [];

  return {
    id: `projection-${randomUUID()}`,
    active_session_id: input.request.make_active ? input.source.id : input.target.id,
    source_session_ids: [input.source.id],
    projection_mode: projectionMode,
    include_selectors: includeSelectors,
    exclude_selectors: excludeSelectors,
    budget: {
      max_tokens: targetIsFocused ? 4000 : 12000,
      max_files: targetIsFocused ? 12 : 40,
      max_events: targetIsFocused ? 50 : 200,
      recency_days: 30,
    },
    rationale: `Project ${input.source.title} into ${input.target.title} without rewriting source identity.`,
  };
}
