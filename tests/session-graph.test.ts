import { describe, expect, it } from "vitest";
import { createEdge, createSession, validateSessionGraphUpdate } from "../src/sessions/sessionGraph.js";
import { sessionJsonSchemas } from "../src/sessions/sessionJsonSchemas.js";
import { SessionGraphSchema } from "../src/sessions/sessionSchemas.js";
import type { AdapterFacet } from "../src/sessions/index.js";

describe("Session graph scaffold", () => {
  it("validates repo sessions composed into an app session", () => {
    const agentCore = createSession({ id: "agent-core", kind: "repo", title: "agent-core" });
    const controlPlane = createSession({ id: "jubilant-goggles", kind: "repo", title: "jubilant-goggles" });
    const app = createSession({ id: "agent-platform", kind: "app", title: "Agent Platform" });
    const graph = {
      sessions: [agentCore, controlPlane, app],
      edges: [
        createEdge({ type: "component_of", source_session_id: agentCore.id, target_session_id: app.id }),
        createEdge({ type: "component_of", source_session_id: controlPlane.id, target_session_id: app.id }),
      ],
      events: [],
    };

    expect(SessionGraphSchema.parse(graph).sessions).toHaveLength(3);
    expect(validateSessionGraphUpdate(graph).valid).toBe(true);
  });

  it("rejects edges pointing at missing sessions", () => {
    const graph = {
      sessions: [createSession({ id: "s1", kind: "goal", title: "Goal" })],
      edges: [createEdge({ type: "depends_on", source_session_id: "s1", target_session_id: "missing" })],
      events: [],
    };

    const result = validateSessionGraphUpdate(graph);

    expect(result.valid).toBe(false);
    expect(result.issues[0].code).toBe("missing_target");
  });

  it("rejects duplicate sessions and duplicate edges", () => {
    const source = createSession({ id: "source", kind: "repo", title: "Source" });
    const target = createSession({ id: "target", kind: "goal", title: "Target" });
    const edgeA = createEdge({ id: "edge-a", type: "references", source_session_id: "source", target_session_id: "target" });
    const edgeB = createEdge({ id: "edge-b", type: "references", source_session_id: "source", target_session_id: "target" });

    const result = validateSessionGraphUpdate({
      sessions: [source, source, target],
      edges: [edgeA, edgeB],
      events: [],
    });

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "duplicate_session")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "duplicate_edge")).toBe(true);
  });

  it("rejects missing parent sessions", () => {
    const child = createSession({ id: "child", kind: "work", title: "Child", parent_id: "missing-parent" });

    const result = validateSessionGraphUpdate({ sessions: [child], edges: [], events: [] });

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "missing_parent")).toBe(true);
  });

  it("exports JSON Schema contracts for control-plane validation", () => {
    const adapterFacet: Pick<AdapterFacet, "preservation_mode"> = {
      preservation_mode: "lossless_reference",
    };

    expect(adapterFacet.preservation_mode).toBe("lossless_reference");
    expect(sessionJsonSchemas.Session).toBeDefined();
    expect(sessionJsonSchemas.SessionUpdateProposal).toBeDefined();
  });
});
