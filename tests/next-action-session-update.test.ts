import { describe, expect, it } from "vitest";
import { createEdge, createSession } from "../src/sessions/sessionGraph.js";
import { NextActionWithSessionUpdateSchema, SessionUpdateProposalSchema } from "../src/sessions/sessionUpdateProposal.js";

describe("next-action session_update scaffold", () => {
  it("validates a mount_session proposal", () => {
    const parsed = SessionUpdateProposalSchema.parse({
      classification: "mount_session",
      active_session_id: "goal-open-terminal",
      mount_request: {
        source_session_id: "repo-openhands",
        target_session_id: "goal-open-terminal",
        user_intent: "Reference executor behavior under the active goal.",
        mount_mode: "reference",
        create_adaptation_session: true,
        make_active: false,
        reason: "Reference executor behavior under the active goal.",
      },
      reason: "The next step needs source behavior projected into this goal.",
    });

    expect(parsed.classification).toBe("mount_session");
    expect(parsed.mount_request?.user_intent).toBe("Reference executor behavior under the active goal.");
    expect(parsed.created_sessions).toEqual([]);
  });

  it("validates a full next-action output with graph changes", () => {
    const child = createSession({ id: "work-backend-terminal", kind: "work", title: "backend terminal endpoint" });
    const edge = createEdge({
      type: "component_of",
      source_session_id: child.id,
      target_session_id: "goal-open-terminal",
    });

    const parsed = NextActionWithSessionUpdateSchema.parse({
      session_update: {
        classification: "create_child",
        active_session_id: "goal-open-terminal",
        created_sessions: [child],
        created_edges: [edge],
        reason: "Split backend work into a child session.",
      },
      decision: "execute",
      task_name: "Implement terminal endpoint",
      target_session_ids: [child.id],
      params: { path: "control-plane/api" },
      certainty: 0.74,
      stakes: "medium",
      risk: "medium",
      reason: "The endpoint is the next dependency.",
      expected_result: "A control-plane terminal action endpoint exists.",
      success_criteria: ["Endpoint contract is defined", "Tests cover request validation"],
      forbidden_actions: ["Do not mutate unrelated sessions"],
    });

    expect(parsed.session_update.created_sessions[0].kind).toBe("work");
  });
});
