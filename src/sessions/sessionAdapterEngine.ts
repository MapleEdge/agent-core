import { randomUUID } from "node:crypto";
import { createEdge, createSession, validateSessionGraphUpdate } from "./sessionGraph.js";
import { createEvent } from "./sessionEvents.js";
import { validatePolicyCompatibility } from "./sessionPolicy.js";
import { buildContextProjection } from "./sessionProjection.js";
import type {
  AdapterFacet,
  AdapterMapping,
  AdapterSourceRole,
  AdapterTargetRole,
  AdaptationMode,
  MountMode,
  MountSessionRequest,
  MountSessionResult,
  PreservationMode,
  Session,
  SessionEdge,
  SessionGraph,
} from "./sessionTypes.js";

function inferSourceRole(source: Session, mountMode: MountMode): AdapterSourceRole {
  if (mountMode === "vendor") return "vendor_dependency";
  if (mountMode === "compare") return "comparison_baseline";
  if (mountMode === "template") return "design_pattern_source";
  if (source.kind === "runtime") return "runtime_backend";
  if (source.kind === "validation") return "test_source";
  if (source.kind === "repo") return "reference_implementation";
  return "documentation_source";
}

function inferTargetRole(target: Session, mountMode: MountMode): AdapterTargetRole {
  if (mountMode === "wrap") return "component_to_wrap";
  if (mountMode === "port") return "component_to_port";
  if (mountMode === "dependency") return "dependency_to_call";
  if (target.kind === "goal") return "capability_to_integrate";
  if (target.kind === "app") return "architecture_to_emulate";
  return "knowledge_source";
}

function preservationModeFor(mountMode: MountMode): PreservationMode {
  if (mountMode === "fork") return "fork";
  if (mountMode === "vendor") return "vendor_import";
  if (mountMode === "port") return "port";
  if (mountMode === "wrap") return "wrap";
  return "lossless_reference";
}

function adaptationModeFor(mountMode: MountMode, source: Session, target: Session): AdaptationMode {
  if (mountMode === "component" || mountMode === "dependency") return "api_mapping";
  if (mountMode === "port") return "migration_plan";
  if (mountMode === "wrap") return "interface_mapping";
  if (source.kind === "repo" && target.kind === "goal") return "capability_mapping";
  return "semantic_projection";
}

function adapterRequired(source: Session, target: Session, request: MountSessionRequest): boolean {
  return source.kind !== target.kind || request.mount_mode === "unknown" || request.user_intent.length > 80;
}

function warningsFor(source: Session, target: Session, request: MountSessionRequest): string[] {
  const warnings: string[] = [];
  if (source.kind !== target.kind) {
    warnings.push(`Cross-kind mount ${source.kind} → ${target.kind} requires semantic adaptation.`);
  }
  if (["repo", "app", "container"].includes(source.kind) && ["goal", "work", "question"].includes(target.kind)) {
    warnings.push("Source is much broader than target; semantic projection should exclude unrelated context.");
  }
  if (request.mount_mode === "unknown") {
    warnings.push("Mount mode is unknown; adapter mapping should be confirmed before execution use.");
  }
  return warnings;
}

export function generateDefaultMappings(input: {
  source: Session;
  target: Session;
  adaptationMode: AdaptationMode;
}): AdapterMapping[] {
  const capabilities = Array.isArray(input.source.facets.repo?.capabilities)
    ? input.source.facets.repo.capabilities.filter((capability): capability is string => typeof capability === "string")
    : [];
  const defaultCapabilities = capabilities.length > 0
    ? capabilities
    : ["shell execution", "browser interaction", "file editing", "task completion detection", "cancellation handling"];

  return defaultCapabilities.map((capability) => ({
    id: `mapping-${randomUUID()}`,
    source: {
      session_id: input.source.id,
      facet: input.source.kind === "repo" ? "repo" : undefined,
      capability,
      description: `${input.source.title}: ${capability}`,
    },
    target: {
      session_id: input.target.id,
      facet: input.target.kind === "goal" ? "goal" : undefined,
      capability,
      description: `${input.target.title}: projected ${capability}`,
    },
    relationship: input.adaptationMode === "migration_plan" ? "ports" : "informs",
    confidence: 0.55,
    evidence: ["default scaffold mapping"],
    status: "hypothesis",
  }));
}

export function createAdaptationSession(input: {
  source: Session;
  target: Session;
  request: MountSessionRequest;
  warnings: string[];
  now?: string;
}): { session: Session; facet: AdapterFacet } {
  const sourceRole = inferSourceRole(input.source, input.request.mount_mode);
  const targetRole = inferTargetRole(input.target, input.request.mount_mode);
  const preservationMode = preservationModeFor(input.request.mount_mode);
  const adaptationMode = adaptationModeFor(input.request.mount_mode, input.source, input.target);
  const mappings = generateDefaultMappings({
    source: input.source,
    target: input.target,
    adaptationMode,
  });
  const facet: AdapterFacet = {
    source_session_id: input.source.id,
    target_session_id: input.target.id,
    source_role: sourceRole,
    target_role: targetRole,
    preservation_mode: preservationMode,
    adaptation_mode: adaptationMode,
    mapping_status: "proposed",
    mappings,
    constraints: [
      ...input.source.policy.security_constraints,
      ...(input.source.policy.license ? [`license:${input.source.policy.license}`] : []),
    ],
    non_goals: ["Do not rewrite source session identity.", "Do not collapse source event history."],
  };
  const session = createSession({
    kind: "adapter",
    title: `Adapt ${input.source.title} into ${input.target.title}`,
    summary: input.request.user_intent,
    facets: { adapter: facet as unknown as Record<string, unknown> },
    root_id: input.target.root_id ?? input.target.id,
    now: input.now,
  });
  return { session, facet };
}

export function mountSession(graph: SessionGraph, request: MountSessionRequest): MountSessionResult {
  const source = graph.sessions.find((session) => session.id === request.source_session_id);
  const target = graph.sessions.find((session) => session.id === request.target_session_id);
  if (!source) throw new Error(`Source session ${request.source_session_id} does not exist.`);
  if (!target) throw new Error(`Target session ${request.target_session_id} does not exist.`);
  if (source.id === target.id) throw new Error("A session cannot be mounted under itself.");

  const warnings = warningsFor(source, target, request);
  const policy = validatePolicyCompatibility(source, target, request);
  if (!policy.ok) throw new Error(policy.errors.join(" "));
  warnings.push(...policy.warnings);

  if (adapterRequired(source, target, request) && !request.create_adaptation_session) {
    throw new Error("Adapter session is required for this mount.");
  }

  const mountedEvent = createEvent({
    type: "session.mounted",
    session_id: target.id,
    data: {
      source_session_id: source.id,
      target_session_id: target.id,
      mount_mode: request.mount_mode,
      preserves_source_identity: true,
    },
  });
  const mountedEdge = createEdge({
    type: "mounted_under",
    source_session_id: source.id,
    target_session_id: target.id,
    metadata: {
      mount_mode: request.mount_mode,
      user_intent: request.user_intent,
      preserves_source_identity: true,
    },
    created_from_event_id: mountedEvent.id,
  });

  let adaptationSession: Session | undefined;
  const adaptationEdges: SessionEdge[] = [];
  const events = [mountedEvent];

  if (request.create_adaptation_session) {
    const adapter = createAdaptationSession({ source, target, request, warnings });
    adaptationSession = adapter.session;
    const adapterCreatedEvent = createEvent({
      type: "session.adapter_created",
      session_id: adaptationSession.id,
      data: { source_session_id: source.id, target_session_id: target.id, facet: adapter.facet },
    });
    events.push(adapterCreatedEvent);
    adaptationEdges.push(
      createEdge({
        type: "adapts_from",
        source_session_id: adaptationSession.id,
        target_session_id: source.id,
        created_from_event_id: adapterCreatedEvent.id,
      }),
      createEdge({
        type: "adapts_into",
        source_session_id: adaptationSession.id,
        target_session_id: target.id,
        created_from_event_id: adapterCreatedEvent.id,
      }),
      createEdge({
        type: "adapted_under",
        source_session_id: source.id,
        target_session_id: adaptationSession.id,
        metadata: { target_context_session_id: target.id },
        created_from_event_id: adapterCreatedEvent.id,
      }),
    );
  }

  const contextProjectionDelta = buildContextProjection({ source, target, request });
  const projectedEvent = createEvent({
    type: "session.adapter_projection_created",
    session_id: adaptationSession?.id ?? target.id,
    data: { projection: contextProjectionDelta },
  });
  events.push(projectedEvent);

  const candidateGraph = {
    sessions: adaptationSession ? [...graph.sessions, adaptationSession] : graph.sessions,
    edges: [...graph.edges, mountedEdge, ...adaptationEdges],
    events: [...graph.events, ...events],
  };
  const validation = validateSessionGraphUpdate(candidateGraph);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join(" "));
  }

  return {
    mounted_edge: mountedEdge,
    adaptation_session: adaptationSession,
    adaptation_edges: adaptationEdges,
    context_projection_delta: contextProjectionDelta,
    warnings,
    events,
  };
}

export const adaptSession = createAdaptationSession;
