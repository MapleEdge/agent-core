export const SESSION_KINDS = [
  "repo",
  "app",
  "goal",
  "work",
  "question",
  "validation",
  "pull_request",
  "deployment",
  "adapter",
  "runtime",
  "memory",
  "artifact",
  "container",
] as const;

export type SessionKind = (typeof SESSION_KINDS)[number];

export const SESSION_STATUSES = [
  "proposed",
  "active",
  "paused",
  "blocked",
  "completed",
  "superseded",
  "merged",
] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SESSION_FACETS = [
  "repo",
  "app",
  "goal",
  "work",
  "adapter",
  "runtime",
  "validation",
  "memory",
  "artifact",
  "pull_request",
  "deployment",
] as const;

export type SessionFacetName = (typeof SESSION_FACETS)[number];

export const SESSION_EDGE_TYPES = [
  "contains",
  "component_of",
  "depends_on",
  "blocks",
  "derived_from",
  "supersedes",
  "sibling_of",
  "implements",
  "validates",
  "produces",
  "consumes",
  "references",
  "merged_into",
  "forked_from",
  "delegates_to",
  "moved_under",
  "mounted_under",
  "adapted_under",
  "adapts_from",
  "adapts_into",
  "projects_as",
  "semantic_alias_of",
] as const;

export type SessionEdgeType = (typeof SESSION_EDGE_TYPES)[number];

export const SESSION_EVENT_TYPES = [
  "session.created",
  "session.updated",
  "session.linked",
  "session.unlinked",
  "session.mounted",
  "session.unmounted",
  "session.adapter_created",
  "session.adapter_mapping_added",
  "session.adapter_mapping_confirmed",
  "session.adapter_projection_created",
  "session.adapter_warning_added",
  "session.merged",
  "session.forked",
  "goal.created",
  "goal.updated",
  "goal.superseded",
  "work.started",
  "work.paused",
  "work.completed",
  "action.proposed",
  "action.executed",
  "action.failed",
  "observation.recorded",
  "artifact.created",
  "validation.started",
  "validation.completed",
  "policy.blocked",
  "user.interjected",
] as const;

export type SessionEventType = (typeof SESSION_EVENT_TYPES)[number];

export const MOUNT_MODES = [
  "reference",
  "component",
  "dependency",
  "vendor",
  "template",
  "fork",
  "port",
  "wrap",
  "compare",
  "unknown",
] as const;

export type MountMode = (typeof MOUNT_MODES)[number];

export const SOURCE_ROLES = [
  "reference_implementation",
  "vendor_dependency",
  "runtime_backend",
  "design_pattern_source",
  "code_source",
  "documentation_source",
  "test_source",
  "migration_source",
  "comparison_baseline",
] as const;

export type AdapterSourceRole = (typeof SOURCE_ROLES)[number];

export const TARGET_ROLES = [
  "capability_to_integrate",
  "component_to_wrap",
  "component_to_port",
  "architecture_to_emulate",
  "behavior_to_match",
  "dependency_to_call",
  "knowledge_source",
] as const;

export type AdapterTargetRole = (typeof TARGET_ROLES)[number];

export const PRESERVATION_MODES = [
  "lossless_reference",
  "copy_snapshot",
  "fork",
  "vendor_import",
  "port",
  "wrap",
  "reimplement",
] as const;

export type PreservationMode = (typeof PRESERVATION_MODES)[number];

export const ADAPTATION_MODES = [
  "semantic_projection",
  "interface_mapping",
  "capability_mapping",
  "file_mapping",
  "api_mapping",
  "behavior_mapping",
  "migration_plan",
] as const;

export type AdaptationMode = (typeof ADAPTATION_MODES)[number];

export const MAPPING_STATUSES = [
  "proposed",
  "mapping",
  "mapped",
  "partially_integrated",
  "integrated",
  "blocked",
  "superseded",
] as const;

export type AdapterMappingStatus = (typeof MAPPING_STATUSES)[number];

export const ADAPTER_MAPPING_RELATIONSHIPS = [
  "same_concept",
  "similar_behavior",
  "wraps",
  "ports",
  "reimplements",
  "depends_on",
  "replaces",
  "informs",
  "conflicts_with",
] as const;

export type AdapterMappingRelationship = (typeof ADAPTER_MAPPING_RELATIONSHIPS)[number];

export const ADAPTER_MAPPING_ITEM_STATUSES = [
  "hypothesis",
  "confirmed",
  "implemented",
  "rejected",
] as const;

export type AdapterMappingItemStatus = (typeof ADAPTER_MAPPING_ITEM_STATUSES)[number];

export const PROJECTION_MODES = [
  "full",
  "summary",
  "capability_map",
  "file_map",
  "api_map",
  "behavior_map",
  "diff_only",
  "memory_only",
] as const;

export type ProjectionMode = (typeof PROJECTION_MODES)[number];

export const SESSION_UPDATE_CLASSIFICATIONS = [
  "no_change",
  "continue_active",
  "create_child",
  "create_sibling",
  "create_parent",
  "merge_sessions",
  "split_session",
  "switch_active",
  "question_only",
  "mount_session",
  "adapt_session",
  "unmount_session",
  "update_adapter",
] as const;

export type SessionUpdateClassification = (typeof SESSION_UPDATE_CLASSIFICATIONS)[number];

export interface SessionPolicy {
  visibility: "public" | "workspace" | "private";
  allow_mount: boolean;
  allow_adapt: boolean;
  license?: string;
  security_constraints: string[];
}

export interface Session {
  id: string;
  kind: SessionKind;
  title: string;
  summary: string;
  status: SessionStatus;
  parent_id: string | null;
  root_id: string | null;
  facets: Partial<Record<SessionFacetName, Record<string, unknown>>>;
  policy: SessionPolicy;
  state: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_from_event_id: string | null;
}

export interface SessionEdge {
  id: string;
  type: SessionEdgeType;
  source_session_id: string;
  target_session_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
  created_from_event_id: string | null;
}

export interface SessionEvent {
  id: string;
  type: SessionEventType;
  session_id: string;
  data: Record<string, unknown>;
  created_at: string;
}

export interface AdapterMappingEndpoint {
  session_id: string;
  facet?: SessionFacetName;
  path?: string;
  symbol?: string;
  endpoint?: string;
  capability?: string;
  description: string;
}

export interface AdapterMapping {
  id: string;
  source: AdapterMappingEndpoint;
  target: AdapterMappingEndpoint;
  relationship: AdapterMappingRelationship;
  confidence: number;
  evidence: string[];
  status: AdapterMappingItemStatus;
}

export interface AdapterFacet {
  source_session_id: string;
  target_session_id: string;
  source_role: AdapterSourceRole;
  target_role: AdapterTargetRole;
  preservation_mode: PreservationMode;
  adaptation_mode: AdaptationMode;
  mapping_status: AdapterMappingStatus;
  mappings: AdapterMapping[];
  constraints: string[];
  non_goals: string[];
}

export interface ContextProjectionBudget {
  max_tokens: number;
  max_files: number;
  max_events: number;
  recency_days?: number;
}

export interface ContextProjection {
  id: string;
  active_session_id: string;
  source_session_ids: string[];
  projection_mode: ProjectionMode;
  include_selectors: string[];
  exclude_selectors: string[];
  budget: ContextProjectionBudget;
  rationale: string;
}

export interface MountSessionRequest {
  source_session_id: string;
  target_session_id: string;
  user_intent: string;
  mount_mode: MountMode;
  create_adaptation_session: boolean;
  make_active?: boolean;
}

export interface MountSessionResult {
  mounted_edge: SessionEdge;
  adaptation_session?: Session;
  adaptation_edges: SessionEdge[];
  context_projection_delta: ContextProjection;
  warnings: string[];
  events: SessionEvent[];
}

export interface SessionGraph {
  sessions: Session[];
  edges: SessionEdge[];
  events: SessionEvent[];
}
