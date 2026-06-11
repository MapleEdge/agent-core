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
  "cancelled",
  "superseded",
  "merged",
  "archived",
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
  "deprecated_moved_under",
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

export const SESSION_EVENT_ACTORS = [
  "user",
  "assistant",
  "system",
  "executor",
] as const;

export type SessionEventActor = (typeof SESSION_EVENT_ACTORS)[number];

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
  /**
   * Whether this session inherits policy constraints from its parent/root chain.
   * Effective policy computation must never let a child loosen an ancestor policy.
   */
  inherit_from_parent: boolean;
  /**
   * Whether this session may request a narrower local override. Overrides are
   * still bounded by effective ancestor policy.
   */
  allow_policy_override: boolean;
  /**
   * Session IDs that contributed to the effective policy projection, when known.
   */
  effective_policy_source_ids: string[];
  license?: string;
  security_constraints: string[];
}

export interface BaseFacet {
  [key: string]: unknown;
}

export interface RepoFacet extends BaseFacet {
  provider?: "github" | "gitlab" | "local" | "unknown";
  repo_full_name?: string;
  remote_url?: string;
  default_branch?: string;
  active_branch?: string;
  worktree_path?: string;
  role?: "backend" | "frontend" | "docs" | "infra" | "library" | "vendor" | "unknown";
  capabilities?: string[];
  known_commands?: {
    test?: string[];
    lint?: string[];
    typecheck?: string[];
    build?: string[];
    dev?: string[];
    [command_kind: string]: string[] | undefined;
  };
  known_paths?: {
    source?: string[];
    tests?: string[];
    docs?: string[];
    config?: string[];
    [path_kind: string]: string[] | undefined;
  };
}

export interface AppFacet extends BaseFacet {
  components?: Array<{
    session_id: string;
    role: string;
    required?: boolean;
  }>;
  integration_contracts?: Array<{
    from_session_id: string;
    to_session_id: string;
    type: "http_api" | "package" | "database" | "message_queue" | "shared_schema" | "unknown";
    contract_session_id?: string;
  }>;
  orchestration?: {
    dev_command?: string;
    test_command?: string;
    compose_file?: string;
  };
}

export interface GoalFacet extends BaseFacet {
  intent?: string;
  kind?: "primary" | "feature" | "bug_fix" | "prerequisite" | "research" | "question" | "validation" | "cleanup";
  priority?: number;
  success_criteria?: string[];
  non_goals?: string[];
  acceptance_state?: "unknown" | "satisfied" | "failed" | "blocked";
  owner_session_ids?: string[];
  blocked_by_session_ids?: string[];
  prerequisite_session_ids?: string[];
}

export interface WorkFacet extends BaseFacet {
  goal_session_id?: string;
  target_session_ids?: string[];
  mode?: "investigate" | "implement" | "validate" | "review" | "explain" | "operate";
  current_phase?: "not_started" | "reading" | "planning" | "editing" | "testing" | "blocked" | "done";
  changed_files?: Array<{
    repo_session_id: string;
    path: string;
    status: "created" | "modified" | "deleted" | "renamed";
  }>;
}

export interface RuntimeFacet extends BaseFacet {
  vm_id?: string;
  desktop_id?: string;
  executor_id?: string;
  process_ids?: string[];
  cancellation_token?: string;
  running_task_id?: string;
}

export interface ValidationFacet extends BaseFacet {
  target_session_id?: string;
  command?: string;
  status?: "not_run" | "running" | "passed" | "failed" | "cancelled";
  summary?: string;
  artifacts?: string[];
}

export interface MemoryFacet extends BaseFacet {
  scope_session_ids?: string[];
  retrieval_modes?: string[];
  last_indexed_at?: string;
}

export interface ArtifactFacet extends BaseFacet {
  artifact_type?: string;
  uri?: string;
  mime_type?: string;
  size_bytes?: number;
}

export interface PullRequestFacet extends BaseFacet {
  provider?: "github" | "gitlab" | "unknown";
  repo_session_id?: string;
  number?: number;
  url?: string;
  branch?: string;
  status?: "draft" | "open" | "merged" | "closed";
}

export interface DeploymentFacet extends BaseFacet {
  environment?: string;
  target_session_id?: string;
  status?: "not_started" | "running" | "succeeded" | "failed" | "cancelled";
  url?: string;
}

export interface SessionFacets {
  repo: RepoFacet;
  app: AppFacet;
  goal: GoalFacet;
  work: WorkFacet;
  adapter: AdapterFacet;
  runtime: RuntimeFacet;
  validation: ValidationFacet;
  memory: MemoryFacet;
  artifact: ArtifactFacet;
  pull_request: PullRequestFacet;
  deployment: DeploymentFacet;
}

export interface Session {
  id: string;
  kind: SessionKind;
  title: string;
  summary: string;
  status: SessionStatus;
  parent_id: string | null;
  root_id: string | null;
  facets: Partial<SessionFacets>;
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
  root_session_id: string | null;
  actor: SessionEventActor;
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

export interface AdapterFacet extends BaseFacet {
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
