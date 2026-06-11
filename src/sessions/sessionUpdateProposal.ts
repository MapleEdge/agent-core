import { z } from "zod";
import { AdapterMappingSchema, MountSessionRequestSchema, SessionEdgeSchema, SessionSchema } from "./sessionSchemas.js";
import { SESSION_UPDATE_CLASSIFICATIONS } from "./sessionTypes.js";

export const SessionUpdateClassificationSchema = z.enum(SESSION_UPDATE_CLASSIFICATIONS);

export const SessionUpdateProposalSchema = z.object({
  classification: SessionUpdateClassificationSchema,
  active_session_id: z.string().min(1).optional(),
  created_sessions: z.array(SessionSchema).default([]),
  created_edges: z.array(SessionEdgeSchema).default([]),
  updated_sessions: z.array(SessionSchema).default([]),
  mount_request: MountSessionRequestSchema.extend({
    reason: z.string().min(1).optional(),
  }).optional(),
  adapter_update: z.object({
    adaptation_session_id: z.string().min(1),
    new_mappings: z.array(AdapterMappingSchema).default([]),
    projection_mode: z.enum([
      "full",
      "summary",
      "capability_map",
      "file_map",
      "api_map",
      "behavior_map",
      "diff_only",
      "memory_only",
    ]),
  }).optional(),
  reason: z.string().min(1),
});

export const NextActionWithSessionUpdateSchema = z.object({
  session_update: SessionUpdateProposalSchema,
  decision: z.enum(["execute", "find_out_more", "ask_user", "stop"]),
  task_name: z.string().min(1),
  target_session_ids: z.array(z.string().min(1)).default([]),
  params: z.record(z.unknown()).default({}),
  certainty: z.number().min(0).max(1),
  stakes: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  risk: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  reason: z.string().min(1),
  progress_note: z.string().optional(),
  missing_information: z.array(z.string()).default([]),
  expected_result: z.string().min(1),
  success_criteria: z.array(z.string()).default([]),
  forbidden_actions: z.array(z.string()).default([]),
});

export type SessionUpdateProposal = z.infer<typeof SessionUpdateProposalSchema>;
export type NextActionWithSessionUpdate = z.infer<typeof NextActionWithSessionUpdateSchema>;

export function validateSessionUpdateProposal(input: unknown) {
  return SessionUpdateProposalSchema.safeParse(input);
}
