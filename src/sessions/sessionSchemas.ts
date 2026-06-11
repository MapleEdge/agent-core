import { z } from "zod";
import {
  ADAPTATION_MODES,
  ADAPTER_MAPPING_ITEM_STATUSES,
  ADAPTER_MAPPING_RELATIONSHIPS,
  MAPPING_STATUSES,
  MOUNT_MODES,
  PRESERVATION_MODES,
  PROJECTION_MODES,
  SESSION_EDGE_TYPES,
  SESSION_EVENT_TYPES,
  SESSION_FACETS,
  SESSION_KINDS,
  SESSION_STATUSES,
  SOURCE_ROLES,
  TARGET_ROLES,
} from "./sessionTypes.js";

const enumSchema = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values);

export const SessionKindSchema = enumSchema(SESSION_KINDS);
export const SessionStatusSchema = enumSchema(SESSION_STATUSES);
export const SessionFacetNameSchema = enumSchema(SESSION_FACETS);
export const SessionEdgeTypeSchema = enumSchema(SESSION_EDGE_TYPES);
export const SessionEventTypeSchema = enumSchema(SESSION_EVENT_TYPES);
export const MountModeSchema = enumSchema(MOUNT_MODES);
export const AdapterSourceRoleSchema = enumSchema(SOURCE_ROLES);
export const AdapterTargetRoleSchema = enumSchema(TARGET_ROLES);
export const PreservationModeSchema = enumSchema(PRESERVATION_MODES);
export const AdaptationModeSchema = enumSchema(ADAPTATION_MODES);
export const AdapterMappingStatusSchema = enumSchema(MAPPING_STATUSES);
export const AdapterMappingRelationshipSchema = enumSchema(ADAPTER_MAPPING_RELATIONSHIPS);
export const AdapterMappingItemStatusSchema = enumSchema(ADAPTER_MAPPING_ITEM_STATUSES);
export const ProjectionModeSchema = enumSchema(PROJECTION_MODES);

export const SessionPolicySchema = z.object({
  visibility: z.enum(["public", "workspace", "private"]).default("workspace"),
  allow_mount: z.boolean().default(true),
  allow_adapt: z.boolean().default(true),
  license: z.string().optional(),
  security_constraints: z.array(z.string()).default([]),
});

export const SessionSchema = z.object({
  id: z.string().min(1),
  kind: SessionKindSchema,
  title: z.string().min(1),
  summary: z.string().default(""),
  status: SessionStatusSchema.default("proposed"),
  parent_id: z.string().min(1).nullable().default(null),
  root_id: z.string().min(1).nullable().default(null),
  facets: z.record(SessionFacetNameSchema, z.record(z.unknown())).default({}),
  policy: SessionPolicySchema.default({}),
  state: z.record(z.unknown()).default({}),
  metadata: z.record(z.unknown()).default({}),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  created_from_event_id: z.string().min(1).nullable().default(null),
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

export const AdapterFacetSchema = z.object({
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
  include_selectors: z.array(z.string()).default([]),
  exclude_selectors: z.array(z.string()).default([]),
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
});

export const MountSessionResultSchema = z.object({
  mounted_edge: SessionEdgeSchema,
  adaptation_session: SessionSchema.optional(),
  adaptation_edges: z.array(SessionEdgeSchema),
  context_projection_delta: ContextProjectionSchema,
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
