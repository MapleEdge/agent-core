import { randomUUID } from "node:crypto";
import type {
  AdapterMapping,
  ContextProjection,
  MountSessionRequest,
  ProjectionMode,
  ProjectionSelector,
  ProjectionSource,
  Session,
} from "./sessionTypes.js";

function defaultProjectionMode(source: Session, target: Session, request: MountSessionRequest): ProjectionMode {
  if (request.mount_mode === "component") return "api_map";
  if (request.mount_mode === "dependency" || request.mount_mode === "vendor") return "capability_map";
  if (source.kind === "repo" && target.kind === "goal") return "behavior_map";
  if (source.kind === target.kind) return "summary";
  return "summary";
}

function projectionSourceFor(mappings: AdapterMapping[] | undefined): ProjectionSource {
  return mappings && mappings.length > 0 ? "mapping_based" : "heuristic";
}

function uniqueSelectors(selectors: ProjectionSelector[]): ProjectionSelector[] {
  return Array.from(new Set(selectors));
}

function selectorsFromMappings(mappings: AdapterMapping[]): ProjectionSelector[] {
  const selectors: ProjectionSelector[] = ["adapter_mappings", "capabilities"];
  for (const mapping of mappings) {
    const text = `${mapping.source.capability ?? ""} ${mapping.target.capability ?? ""} ${mapping.source.path ?? ""} ${mapping.target.path ?? ""} ${mapping.source.endpoint ?? ""} ${mapping.target.endpoint ?? ""}`.toLowerCase();
    if (text.includes("api") || text.includes("endpoint")) selectors.push("api_contracts", "interfaces");
    if (text.includes("file") || mapping.source.path || mapping.target.path) selectors.push("relevant_files");
    if (text.includes("command") || text.includes("test") || text.includes("lint")) selectors.push("known_commands");
    if (text.includes("cancel") || text.includes("termination") || text.includes("completion") || text.includes("loop")) selectors.push("termination_conditions", "behaviors");
  }
  return uniqueSelectors(selectors);
}

function baseIncludeSelectors(input: {
  source: Session;
  target: Session;
  mappings?: AdapterMapping[];
}): ProjectionSelector[] {
  if (input.mappings && input.mappings.length > 0) {
    return selectorsFromMappings(input.mappings);
  }

  const sourceIsBroad = ["repo", "app", "container"].includes(input.source.kind);
  const targetIsFocused = ["goal", "work", "question"].includes(input.target.kind);
  return sourceIsBroad && targetIsFocused
    ? ["capabilities", "behaviors", "interfaces", "relevant_files", "termination_conditions"]
    : ["summary", "facets", "relationships"];
}

function baseExcludeSelectors(source: Session, target: Session): ProjectionSelector[] {
  const sourceIsBroad = ["repo", "app", "container"].includes(source.kind);
  const targetIsFocused = ["goal", "work", "question"].includes(target.kind);
  return sourceIsBroad && targetIsFocused
    ? ["unrelated_ui", "deployment", "plugins", "historical_noise", "unrelated_capabilities"]
    : [];
}

function projectionEvidence(input: {
  source: Session;
  target: Session;
  mappings?: AdapterMapping[];
  projectionSource: ProjectionSource;
}): string[] {
  const evidence = [
    `source:${input.source.id}:${input.source.kind}`,
    `target:${input.target.id}:${input.target.kind}`,
    `projection_source:${input.projectionSource}`,
  ];
  if (input.mappings && input.mappings.length > 0) {
    evidence.push(`mapping_count:${input.mappings.length}`);
    for (const mapping of input.mappings.slice(0, 8)) {
      evidence.push(`mapping:${mapping.id}:${mapping.relationship}:${mapping.confidence}`);
    }
  }
  return evidence;
}

function relevanceScore(input: {
  source: Session;
  target: Session;
  mappings?: AdapterMapping[];
  projectionMode: ProjectionMode;
}): number {
  let score = 0.5;
  if (input.mappings && input.mappings.length > 0) {
    const avg = input.mappings.reduce((sum, mapping) => sum + mapping.confidence, 0) / input.mappings.length;
    score = Math.max(score, avg);
  }
  if (input.source.kind === "repo" && input.target.kind === "goal") score += 0.1;
  if (input.projectionMode === "behavior_map" || input.projectionMode === "capability_map") score += 0.05;
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

export function buildContextProjection(input: {
  source: Session;
  target: Session;
  request: MountSessionRequest;
  mappings?: AdapterMapping[];
  now?: string;
}): ContextProjection {
  const projectionMode = defaultProjectionMode(input.source, input.target, input.request);
  const sourceIsBroad = ["repo", "app", "container"].includes(input.source.kind);
  const targetIsFocused = ["goal", "work", "question"].includes(input.target.kind);
  const projectionSource = projectionSourceFor(input.mappings);
  const includeSelectors = baseIncludeSelectors(input);
  const excludeSelectors = baseExcludeSelectors(input.source, input.target);

  return {
    id: `projection-${randomUUID()}`,
    // Mounting projects source meaning into the target context. make_active is a
    // UI/session-switch concern and must not change the projection anchor.
    active_session_id: input.target.id,
    source_session_ids: [input.source.id],
    projection_mode: projectionMode,
    projection_source: projectionSource,
    relevance_score: relevanceScore({
      source: input.source,
      target: input.target,
      mappings: input.mappings,
      projectionMode,
    }),
    evidence: projectionEvidence({
      source: input.source,
      target: input.target,
      mappings: input.mappings,
      projectionSource,
    }),
    include_selectors: includeSelectors,
    exclude_selectors: excludeSelectors,
    budget: {
      max_tokens: targetIsFocused ? 4000 : 12000,
      max_files: targetIsFocused ? 12 : 40,
      max_events: targetIsFocused ? 50 : 200,
      recency_days: 30,
    },
    rationale: sourceIsBroad && targetIsFocused
      ? `Project only the mapped and goal-relevant portions of ${input.source.title} into ${input.target.title}.`
      : `Project ${input.source.title} into ${input.target.title} without rewriting source identity.`,
  };
}
