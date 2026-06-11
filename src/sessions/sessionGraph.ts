import { randomUUID } from "node:crypto";
import { createEvent } from "./sessionEvents.js";
import { SESSION_EDGE_TYPES } from "./sessionTypes.js";
import type {
  Session,
  SessionEdge,
  SessionEdgeType,
  SessionEvent,
  SessionEventType,
  SessionGraph,
  SessionKind,
  SessionPolicy,
  SessionStatus,
} from "./sessionTypes.js";

const DEFAULT_POLICY: SessionPolicy = {
  visibility: "workspace",
  allow_mount: true,
  allow_adapt: true,
  allow_outbound_mount: true,
  allow_inbound_mount: true,
  allow_outbound_adapt: true,
  allow_inbound_adapt: true,
  inherit_from_parent: true,
  allow_policy_override: false,
  effective_policy_source_ids: [],
  security_constraints: [],
};

export interface GraphValidationIssue {
  code: string;
  message: string;
  session_id?: string;
  edge_id?: string;
}

export interface GraphValidationResult {
  valid: boolean;
  issues: GraphValidationIssue[];
}

export function createSession(input: {
  id?: string;
  kind: SessionKind;
  title: string;
  summary?: string;
  status?: SessionStatus;
  parent_id?: string | null;
  root_id?: string | null;
  facets?: Session["facets"];
  policy?: Partial<SessionPolicy>;
  state?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  created_from_event_id?: string | null;
  now?: string;
}): Session {
  const now = input.now ?? new Date().toISOString();
  const id = input.id ?? `session-${randomUUID()}`;
  return {
    id,
    kind: input.kind,
    title: input.title,
    summary: input.summary ?? "",
    status: input.status ?? "proposed",
    parent_id: input.parent_id ?? null,
    root_id: input.root_id ?? input.parent_id ?? id,
    facets: input.facets ?? {},
    policy: { ...DEFAULT_POLICY, ...input.policy },
    state: input.state ?? {},
    metadata: input.metadata ?? {},
    created_at: now,
    updated_at: now,
    created_from_event_id: input.created_from_event_id ?? null,
  };
}

export function createEdge(input: {
  type: SessionEdgeType;
  source_session_id: string;
  target_session_id: string;
  metadata?: Record<string, unknown>;
  created_from_event_id?: string | null;
  now?: string;
  id?: string;
}): SessionEdge {
  return {
    id: input.id ?? `edge-${randomUUID()}`,
    type: input.type,
    source_session_id: input.source_session_id,
    target_session_id: input.target_session_id,
    metadata: input.metadata ?? {},
    created_at: input.now ?? new Date().toISOString(),
    created_from_event_id: input.created_from_event_id ?? null,
  };
}

export function createSessionEvent(input: {
  type: SessionEventType;
  session_id: string;
  root_session_id?: string | null;
  data?: Record<string, unknown>;
  now?: string;
  id?: string;
}): SessionEvent {
  return createEvent(input);
}

export function validateEdgeTypes(edges: SessionEdge[]): GraphValidationIssue[] {
  return edges
    .filter((edge) => !SESSION_EDGE_TYPES.includes(edge.type))
    .map((edge) => ({
      code: "invalid_edge_type",
      message: `Invalid edge type ${edge.type}.`,
      edge_id: edge.id,
    }));
}

function reachable(
  edges: SessionEdge[],
  startSessionId: string,
  targetSessionId: string,
  traversedTypes: Set<SessionEdgeType>,
): boolean {
  const visited = new Set<string>();
  const stack = [startSessionId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    if (current === targetSessionId) return true;
    visited.add(current);
    for (const edge of edges) {
      if (edge.source_session_id === current && traversedTypes.has(edge.type)) {
        stack.push(edge.target_session_id);
      }
    }
  }
  return false;
}

export function validateNoCycle(sessions: Session[], edges: SessionEdge[]): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  const containmentTypes = new Set<SessionEdgeType>([
    "contains",
    "component_of",
    "mounted_under",
    "adapted_under",
    "merged_into",
  ]);
  const allEdges = [
    ...edges,
    ...sessions
      .filter((session) => session.parent_id !== null)
      .map((session) => createEdge({
        type: "contains",
        source_session_id: session.parent_id as string,
        target_session_id: session.id,
      })),
  ];

  for (const edge of allEdges) {
    if (!containmentTypes.has(edge.type)) continue;
    if (edge.source_session_id === edge.target_session_id) {
      issues.push({
        code: "cycle",
        message: "Session graph cannot contain a self-cycle.",
        edge_id: edge.id,
      });
      continue;
    }
    if (reachable(allEdges, edge.target_session_id, edge.source_session_id, containmentTypes)) {
      issues.push({
        code: "cycle",
        message: `Adding ${edge.type} would create a containment cycle.`,
        edge_id: edge.id,
      });
    }
  }
  return issues;
}

function validateDuplicateSessions(sessions: Session[]): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  const seen = new Set<string>();
  for (const session of sessions) {
    if (seen.has(session.id)) {
      issues.push({
        code: "duplicate_session",
        message: `Duplicate session id ${session.id}.`,
        session_id: session.id,
      });
    }
    seen.add(session.id);
  }
  return issues;
}

function validateDuplicateEdges(edges: SessionEdge[]): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  for (const edge of edges) {
    if (seenIds.has(edge.id)) {
      issues.push({
        code: "duplicate_edge_id",
        message: `Duplicate edge id ${edge.id}.`,
        edge_id: edge.id,
      });
    }
    seenIds.add(edge.id);

    const key = `${edge.type}:${edge.source_session_id}:${edge.target_session_id}`;
    if (seenKeys.has(key)) {
      issues.push({
        code: "duplicate_edge",
        message: `Duplicate edge ${edge.type} ${edge.source_session_id} -> ${edge.target_session_id}.`,
        edge_id: edge.id,
      });
    }
    seenKeys.add(key);
  }
  return issues;
}

export function validateSessionGraphUpdate(graph: SessionGraph): GraphValidationResult {
  const sessionIds = new Set(graph.sessions.map((session) => session.id));
  const issues: GraphValidationIssue[] = [];

  issues.push(...validateDuplicateSessions(graph.sessions));
  issues.push(...validateDuplicateEdges(graph.edges));

  for (const session of graph.sessions) {
    if (session.parent_id !== null && !sessionIds.has(session.parent_id)) {
      issues.push({
        code: "missing_parent",
        message: `Session ${session.id} parent ${session.parent_id} does not exist.`,
        session_id: session.id,
      });
    }
  }

  for (const edge of graph.edges) {
    if (!sessionIds.has(edge.source_session_id)) {
      issues.push({
        code: "missing_source",
        message: `Edge ${edge.id} source ${edge.source_session_id} does not exist.`,
        edge_id: edge.id,
      });
    }
    if (!sessionIds.has(edge.target_session_id)) {
      issues.push({
        code: "missing_target",
        message: `Edge ${edge.id} target ${edge.target_session_id} does not exist.`,
        edge_id: edge.id,
      });
    }
  }

  issues.push(...validateEdgeTypes(graph.edges));
  issues.push(...validateNoCycle(graph.sessions, graph.edges));

  return { valid: issues.length === 0, issues };
}

function asSession(value: unknown): Session | null {
  return typeof value === "object" && value !== null ? value as Session : null;
}

function asEdge(value: unknown): SessionEdge | null {
  return typeof value === "object" && value !== null ? value as SessionEdge : null;
}

export function reduceSessionEventsToGraph(events: SessionEvent[]): SessionGraph {
  const sessions = new Map<string, Session>();
  const edges = new Map<string, SessionEdge>();

  for (const event of events) {
    if (event.type === "session.created" || event.type === "session.adapter_created") {
      const session = asSession(event.data.session);
      if (session) sessions.set(session.id, session);
    }
    if (event.type === "session.linked" || event.type === "session.mounted") {
      const edge = asEdge(event.data.edge);
      if (edge) edges.set(edge.id, edge);
    }
  }

  return { sessions: Array.from(sessions.values()), edges: Array.from(edges.values()), events };
}

export function mergeSessions(input: {
  source_sessions: Session[];
  title: string;
  summary?: string;
  now?: string;
}): { session: Session; edges: SessionEdge[]; event: SessionEvent } {
  const session = createSession({
    kind: "container",
    title: input.title,
    summary: input.summary ?? "Composition session for merged sources.",
    facets: { app: { source_count: input.source_sessions.length } },
    now: input.now,
  });
  const edges = input.source_sessions.map((source) => createEdge({
    type: "merged_into",
    source_session_id: source.id,
    target_session_id: session.id,
    metadata: { preserves_source_identity: true },
    now: input.now,
  }));
  const event = createEvent({
    type: "session.merged",
    session_id: session.id,
    root_session_id: session.root_id,
    data: { source_session_ids: input.source_sessions.map((source) => source.id), edge_ids: edges.map((edge) => edge.id) },
    now: input.now,
  });
  return { session, edges, event };
}
