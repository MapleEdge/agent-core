import { z } from "zod";
import {
  ADAPTATION_MODES,
  ADAPTER_MAPPING_ITEM_STATUSES,
  ADAPTER_MAPPING_RELATIONSHIPS,
  MAPPING_STATUSES,
  MOUNT_MODES,
  PRESERVATION_MODES,
  PROJECTION_MODES,
  PROJECTION_SELECTORS,
  PROJECTION_SOURCES,
  SESSION_EDGE_TYPES,
  SESSION_EVENT_ACTORS,
  SESSION_EVENT_TYPES,
  SESSION_FACETS,
  SESSION_KINDS,
  SESSION_STATUSES,
  SOURCE_ROLES,
  TARGET_ROLES,
} from "./sessionTypes.js";

const enumSchema = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values);
const LooseObjectSchema = z.record(z.unknown());

export const SessionKindSchema = enumSchema(SESSION_KINDS);
export const SessionStatusSchema = enumSchema(SESSION_STATUSES);
export const SessionFacetNameSchema = enumSchema(SESSION_FACETS);
export const SessionEdgeTypeSchema = enumSchema(SESSION_EDGE_TYPES);
export const SessionEventTypeSchema = enumSchema(SESSION_EVENT_TYPES);
export const SessionEventActorSchema = enumSchema(SESSION_EVENT_ACTORS);
export const MountModeSchema = enumSchema(MOUNT_MODES);
export const AdapterSourceRoleSchema = enumSchema(SOURCE_ROLES);
export const AdapterTargetRoleSchema = enumSchema(TARGET_ROLES);
export const PreservationModeSchema = enumSchema(PRESERVATION_MODES);
export const AdaptationModeSchema = enumSchema(ADAPTATION_MODES);
export const AdapterMappingStatusSchema = enumSchema(MAPPING_STATUSES);
export const AdapterMappingRelationshipSchema = enumSchema(ADAPTER_MAPPING_RELATIONSHIPS);
export const AdapterMappingItemStatusSchema = enumSchema(ADAPTER_MAPPING_ITEM_STATUSES);
export const ProjectionModeSchema = enumSchema(PROJECTION_MODES);
export const ProjectionSourceSchema = enumSchema(PROJECTION_SOURCES);
export const ProjectionSelectorSchema = enumSchema(PROJECTION_SELECTORS);

export const PolicyAuthorizationContextSchema = z.object({
  allow_private_projection: z.boolean().optional(),
  authorized_by: z.string().optional(),
  reason: z.string().optional(),
  grants: z.array(z.string()).optional(),
});

export const SessionPolicySchema = z.object({
  visibility: z.enum(["public", "workspace", "private"]).default("workspace"),
  allow_mount: z.boolean().default(true),
  allow_adapt: z.boolean().default(true),
  allow_outbound_mount: z.boolean().default(true),
  allow_inbound_mount: z.boolean().default(true),
  allow_outbound_adapt: z.boolean().default(true),
  allow_inbound_adapt: z.boolean().default(true),
  inherit_from_parent: z.boolean().default(true),
  allow_policy_override: z.boolean().default(false),
  effective_policy_source_ids: z.array(z.string().min(1)).default([]),
  license: z.string().optional(),
  security_constraints: z.array(z.string()).default([]),
});

export const PolicyCheckEvidenceSchema = z.object({
  code: z.string().min(1),
  ok: z.boolean(),
  message: z.string().min(1),
  source_session_id: z.string().min(1).optional(),
  target_session_id: z.string().min(1).optional(),
});

export const PolicyEvidenceSchema = z.object({
  source_effective_policy: SessionPolicySchema,
  target_effective_policy: SessionPolicySchema,
  source_policy_source_ids: z.array(z.string().min(1)),
  target_policy_source_ids: z.array(z.string().min(1)),
  authorization: PolicyAuthorizationContextSchema.optional(),
  checks: z.array(PolicyCheckEvidenceSchema),
});

export const RepoFacetSchema = LooseObjectSchema.extend({
  provider: z.enum(["github", "gitlab", "local", "unknown"]).optional(),
  repo_full_name: z.string().optional(),
  remote_url: z.string().optional(),
  default_branch: z.string().optional(),
  active_branch: z.string().optional(),
  worktree_path: z.string().optional(),
  role: z.enum(["backend", "frontend", "docs", "infra", "library", "vendor", "unknown"]).optional(),
  capabilities: z.array(z.string()).optional(),
  known_commands: z.record(z.array(z.string()).optional()).optional(),
  known_paths: z.record(z.array(z.string()).optional()).optional(),
});

export const AppFacetSchema = LooseObjectSchema.extend({
  components: z.array(z.object({
    session_id: z.string().min(1),
    role: z.string().min(1),
    required: z.boolean().optional(),
  })).optional(),
  integration_contracts: z.array(z.object({
    from_session_id: z.string().min(1),
    to_session_id: z.string().min(1),
    type: z.enum(["http_api", "package", "database", "message_queue", "shared_schema", "unknown"]),
    contract_session_id: z.string().min(1).optional(),
  })).optional(),
  orchestration: z.object({
    dev_command: z.string().optional(),
    test_command: z.string().optional(),
    compose_file: z.string().optional(),
  }).optional(),
});

export const GoalFacetSchema = LooseObjectSchema.extend({
  intent: z.string().optional(),
  kind: z.enum(["primary", "feature", "bug_fix", "prerequisite", "research", "question", "validation", "cleanup"]).optional(),
  priority: z.number().optional(),
  success_criteria: z.array(z.string()).optional(),
  non_goals: z.array(z.string()).optional(),
  acceptance_state: z.enum(["unknown", "satisfied", "failed", "blocked"]).optional(),
  owner_session_ids: z.array(z.string()).optional(),
  blocked_by_session_ids: z.array(z.string()).optional(),
  prerequisite_session_ids: z.array(z.string()).optional(),
});

export const WorkFacetSchema = LooseObjectSchema.extend({
  goal_session_id: z.string().optional(),
  target_session_ids: z.array(z.string()).optional(),
  mode: z.enum(["investigate", "implement", "validate", "review", "explain", "operate"]).optional(),
  current_phase: z.enum(["not_started", "reading", "planning", "editing", "testing", "blocked", "done"]).optional(),
  changed_files: z.array(z.object({
    repo_session_id: z.string().min(1),
    path: z.string().min(1),
    status: z.enum(["created", "modified", "deleted", "renamed"]),
  })).optional(),
});

export const RuntimeFacetSchema = LooseObjectSchema.extend({
  vm_id: z.string().optional(),
  desktop_id: z.string().optional(),
  executor_id: z.string().optional(),
  process_ids: z.array(z.string()).optional(),
  cancellation_token: z.string().optional(),
  running_task_id: z.string().optional(),
});

export const ValidationFacetSchema = LooseObjectSchema.extend({
  target_session_id: z.string().optional(),
  command: z.string().optional(),
  status: z.enum(["not_run", "running", "passed", "failed", "cancelled"]).optional(),
  summary: z.string().optional(),
  artifacts: z.array(z.string()).optional(),
});

export const MemoryFacetSchema = LooseObjectSchema.extend({
  scope_session_ids: z.array(z.string()).optional(),
  retrieval_modes: z.array(z.string()).optional(),
  last_indexed_at: z.string().optional(),
});

export const ArtifactFacetSchema = LooseObjectSchema.extend({
  artifact_type: z.string().optional(),
  uri: z.string().optional(),
  mime_type: z.string().optional(),
  size_bytes: z.number().optional(),
});

export const PullRequestFacetSchema = LooseObjectSchema.extend({
  provider: z.enum(["github", "gitlab", "unknown"]).optional(),
  repo_session_id: z.string().optional(),
  number: z.number().int().positive().optional(),
  url: z.string().optional(),
  branch: z.string().optional(),
  status: z.enum(["draft", "open", "merged", "closed"]).optional(),
});

export const DeploymentFacetSchema = LooseObjectSchema.extend({
  environment: z.string().optional(),
  target_session_id: z.string().optional(),
  status: z.enum(["not_started", "running", "succeeded", "failed", "cancelled"]).optional(),
  url: z.string().optional(),
});

export const SessionEdgeSchema = z.object({
  id: z.string().min(1),
  type: SessionEdgeTypeSchema,
  source_session_id: z.string().min(1),
  target_session_id: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
  created_at: z.string().min(1),
  created_from_event_id: z.string().min(1).nullable().default(null),
});

export const SessionEventSchema = z.object({
  id: z.string().min(1),
  type: SessionEventTypeSchema,
  session_id: z.string().min(1),
  root_session_id: z.string().min(1).nullable().default(null),
  actor: SessionEventActorSchema.default("system"),
  data: z.record(z.unknown()).default({}),
  created_at: z.string().min(1),
});

export const AdapterMappingEndpointSchema = z.object({
  session_id: z.string().min(1),
  facet: SessionFacetNameSchema.optional(),
  path: z.string().optional(),
  symbol: z.string().optional(),
  endpoint: z.string().optional(),
  capability: z.string().optional(),
  description: z.string().min(1),
});

export const AdapterMappingSchema = z.object({
  id: z.string().min(1),
  source: AdapterMappingEndpointSchema,
  target: AdapterMappingEndpointSchema,
  relationship: AdapterMappingRelationshipSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()).default([]),
  status: AdapterMappingItemStatusSchema.default("hypothesis"),
});

export const AdapterFacetSchema = LooseObjectSchema.extend({
  source_session_id: z.string().min(1),
  target_session_id: z.string().min(1),
  source_role: AdapterSourceRoleSchema,
  target_role: AdapterTargetRoleSchema,
  preservation_mode: PreservationModeSchema,
  adaptation_mode: AdaptationModeSchema,
  mapping_status: AdapterMappingStatusSchema.default("proposed"),
  mappings: z.array(AdapterMappingSchema).default([]),
  constraints: z.array(z.string()).default([]),
  non_goals: z.array(z.string()).default([]),
});

export const SessionFacetsSchema = z.object({
  repo: RepoFacetSchema.optional(),
  app: AppFacetSchema.optional(),
  goal: GoalFacetSchema.optional(),
  work: WorkFacetSchema.optional(),
  adapter: AdapterFacetSchema.optional(),
  runtime: RuntimeFacetSchema.optional(),
  validation: ValidationFacetSchema.optional(),
  memory: MemoryFacetSchema.optional(),
  artifact: ArtifactFacetSchema.optional(),
  pull_request: PullRequestFacetSchema.optional(),
  deployment: DeploymentFacetSchema.optional(),
}).default({});

export const SessionSchema = z.object({
  id: z.string().min(1),
  kind: SessionKindSchema,
  title: z.string().min(1),
  summary: z.string().default(""),
  status: SessionStatusSchema.default("proposed"),
  parent_id: z.string().min(1).nullable().default(null),
  root_id: z.string().min(1).nullable().default(null),
  facets: SessionFacetsSchema,
  policy: SessionPolicySchema.default({}),
  state: z.record(z.unknown()).default({}),
  metadata: z.record(z.unknown()).default({}),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  created_from_event_id: z.string().min(1).nullable().default(null),
});

export const ContextProjectionBudgetSchema = z.object({
  max_tokens: z.number().int().positive(),
  max_files: z.number().int().nonnegative(),
  max_events: z.number().int().nonnegative(),
  recency_days: z.number().int().positive().optional(),
});

export const ContextProjectionSchema = z.object({
  id: z.string().min(1),
  active_session_id: z.string().min(1),
  source_session_ids: z.array(z.string().min(1)).min(1),
  projection_mode: ProjectionModeSchema,
  projection_source: ProjectionSourceSchema.default("heuristic"),
  relevance_score: z.number().min(0).max(1).default(0.5),
  evidence: z.array(z.string()).default([]),
  include_selectors: z.array(ProjectionSelectorSchema).default([]),
  exclude_selectors: z.array(ProjectionSelectorSchema).default([]),
  budget: ContextProjectionBudgetSchema,
  rationale: z.string().min(1),
});

export const MountSessionRequestSchema = z.object({
  source_session_id: z.string().min(1),
  target_session_id: z.string().min(1),
  user_intent: z.string().min(1),
  mount_mode: MountModeSchema,
  create_adaptation_session: z.boolean(),
  make_active: z.boolean().optional(),
  authorization: PolicyAuthorizationContextSchema.optional(),
});

export const MountSessionResultSchema = z.object({
  mounted_edge: SessionEdgeSchema,
  adaptation_session: SessionSchema.optional(),
  adaptation_edges: z.array(SessionEdgeSchema),
  context_projection_delta: ContextProjectionSchema,
  policy_evidence: PolicyEvidenceSchema,
  warnings: z.array(z.string()),
  events: z.array(SessionEventSchema),
});

export const SessionGraphSchema = z.object({
  sessions: z.array(SessionSchema),
  edges: z.array(SessionEdgeSchema),
  events: z.array(SessionEventSchema),
});

export type SessionSchemaType = z.infer<typeof SessionSchema>;
export type SessionEdgeSchemaType = z.infer<typeof SessionEdgeSchema>;
export type SessionEventSchemaType = z.infer<typeof SessionEventSchema>;
export type AdapterFacetSchemaType = z.infer<typeof AdapterFacetSchema>;
export type MountSessionRequestSchemaType = z.infer<typeof MountSessionRequestSchema>;
