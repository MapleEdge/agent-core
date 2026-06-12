import type { ActionDefinition } from "../../providers/ActionKnowledgeProvider.js";

/**
 * Planning actions are visible catalog entries because they produce and maintain
 * the user-facing plan checklist. They are not platform-executable work steps.
 * The execution layer should only receive actions chosen by recommend-next.
 */
export const planningActions: ActionDefinition[] = [
  {
    name: "planning.generate_plan",
    description: "Create or refresh the visible user-facing plan checklist for the session. This produces UI state, not executable work.",
    params_json_schema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        goal: { type: "string" },
        context: { type: "object" },
      },
      required: ["session_id", "goal"],
    },
    output_json_schema: {
      type: "object",
      properties: {
        plan: { type: "object" },
      },
    },
    risk: "low",
    side_effects: ["updates_visible_plan_ui_state"],
    requires_platform_validation: true,
  },
  {
    name: "planning.revise_plan",
    description: "Revise the visible plan checklist so it aligns with the latest recommend-next decision.",
    params_json_schema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        reason: { type: "string" },
        recommended_action: { type: "object" },
      },
      required: ["session_id", "reason", "recommended_action"],
    },
    output_json_schema: {
      type: "object",
      properties: {
        plan: { type: "object" },
      },
    },
    risk: "low",
    side_effects: ["updates_visible_plan_ui_state"],
    requires_platform_validation: true,
  },
];
