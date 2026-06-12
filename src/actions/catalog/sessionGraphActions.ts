import { z, type ZodType } from "zod";
import type { CanonicalAction, RiskLevel } from "./canonicalActions.js";

function graphAction(
  name: string,
  description: string,
  zodSchema: ZodType,
  opts: {
    risk?: RiskLevel;
    side_effects?: string[];
    requires_approval?: boolean;
    planner_guidance?: string;
    output_json_schema?: Record<string, unknown>;
  } = {},
): CanonicalAction {
  return {
    name,
    category: "session_graph",
    description,
    zodSchema,
    params_json_schema: {},
    output_json_schema: opts.output_json_schema ?? {},
    risk: opts.risk ?? "medium",
    side_effects: opts.side_effects ?? [],
    requires_platform_validation: true,
    requires_approval: opts.requires_approval ?? false,
    planner_guidance: opts.planner_guidance ?? "",
  };
}

const MountSessionRequestSchema = z.object({
  source_session_id: z.string().min(1),
  target_session_id: z.string().min(1),
  user_intent: z.string().min(1),
  mount_mode: z.enum([
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
  ]),
  create_adaptation_session: z.boolean(),
  make_active: z.boolean().optional(),
  authorization: z.object({
    allow_private_projection: z.boolean().optional(),
    authorized_by: z.string().optional(),
    reason: z.string().optional(),
    grants: z.array(z.string()).optional(),
  }).optional(),
});

const UnmountSessionRequestSchema = z.object({
  source_session_id: z.string().min(1),
  target_session_id: z.string().min(1),
  reason: z.string().optional(),
  remove_adapter_edges: z.boolean().optional(),
});

export const session_mount = graphAction(
  "session.mount",
  "Mount a source session under a target session, optionally creating an adapter session and context projection.",
  MountSessionRequestSchema,
  {
    risk: "medium",
    side_effects: [
      "session_graph.edge:mounted_under",
      "session_graph.projection:context_delta",
      "session_graph.event:session.mounted",
      "session_graph.optional_session:adapter",
    ],
    planner_guidance: "Use when a repo, runtime, app, memory, validation, or artifact session must become available to a goal or work session. jubilant-goggles applies this through /api/session-graph/actions/apply.",
  },
);

export const session_mount_preview = graphAction(
  "session.mount.preview",
  "Validate and preview a session mount without persisting graph changes.",
  MountSessionRequestSchema,
  {
    risk: "low",
    side_effects: [],
    planner_guidance: "Use before session.mount when policy or adapter implications are uncertain. This is advisory/read-only and still requires platform validation.",
  },
);

export const session_adapt = graphAction(
  "session.adapt",
  "Create an adapter session and projection scaffold between source and target sessions without mounting the source directly.",
  MountSessionRequestSchema,
  {
    risk: "medium",
    side_effects: [
      "session_graph.session:adapter",
      "session_graph.edges:adapter",
      "session_graph.projection:context_delta",
      "session_graph.event:session.adapter_created",
    ],
    planner_guidance: "Use when the platform needs adapter mappings before deciding whether a full mount is appropriate.",
  },
);

export const session_unmount = graphAction(
  "session.unmount",
  "Remove a mounted_under relationship between source and target sessions.",
  UnmountSessionRequestSchema,
  {
    risk: "medium",
    side_effects: [
      "session_graph.remove_edge:mounted_under",
      "session_graph.event:session.unmounted",
    ],
    planner_guidance: "Use to detach context that is no longer relevant. Do not use for deleting sessions.",
  },
);

export const SESSION_GRAPH_ACTIONS: CanonicalAction[] = [
  session_mount,
  session_mount_preview,
  session_adapt,
  session_unmount,
];
