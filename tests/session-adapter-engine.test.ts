import { describe, expect, it } from "vitest";
import { createEdge, createSession, mergeSessions, validateSessionGraphUpdate } from "../src/sessions/sessionGraph.js";
import { mountSession } from "../src/sessions/sessionAdapterEngine.js";
import type { SessionGraph } from "../src/sessions/sessionTypes.js";

function baseGraph(): SessionGraph {
  const source = createSession({
    id: "session-repo-reference",
    kind: "repo",
    title: "Reference Repo",
    summary: "Reference implementation for behavior mapping.",
    facets: {
      repo: {
        capabilities: ["shell execution", "browser interaction", "file editing", "agent loop", "task completion detection", "cancellation handling"],
      },
    },
  });
  const target = createSession({
    id: "session-goal-integration",
    kind: "goal",
    title: "Integrate referenced functionality",
    summary: "Goal session for behavior mapping.",
  });
  return { sessions: [source, target], edges: [], events: [] };
}

describe("SessionAdapter Engine", () => {
  it("preserves source identity and history when mounting", () => {
    const graph = baseGraph();
    const before = JSON.stringify(graph.sessions[0]);
    mountSession(graph, { source_session_id: "session-repo-reference", target_session_id: "session-goal-integration", user_intent: "Use reference behavior.", mount_mode: "reference", create_adaptation_session: true });
    expect(JSON.stringify(graph.sessions[0])).toBe(before);
  });

  it("creates a mounted edge and adapter session for cross-kind mounts", () => {
    const result = mountSession(baseGraph(), { source_session_id: "session-repo-reference", target_session_id: "session-goal-integration", user_intent: "Adapt behavior.", mount_mode: "reference", create_adaptation_session: true });
    expect(result.mounted_edge.type).toBe("mounted_under");
    expect(result.mounted_edge.metadata.preserves_source_identity).toBe(true);
    expect(result.adaptation_session?.kind).toBe("adapter");
    expect(result.adaptation_session?.facets.adapter).toBeDefined();
  });

  it("creates adapts_from and adapts_into edges from the adapter session", () => {
    const result = mountSession(baseGraph(), { source_session_id: "session-repo-reference", target_session_id: "session-goal-integration", user_intent: "Map source capabilities.", mount_mode: "reference", create_adaptation_session: true });
    expect(result.adaptation_edges.map((edge) => edge.type)).toContain("adapts_from");
    expect(result.adaptation_edges.map((edge) => edge.type)).toContain("adapts_into");
    expect(result.adaptation_edges.every((edge) => edge.source_session_id === result.adaptation_session?.id || edge.type === "adapted_under")).toBe(true);
  });

  it("rejects invalid containment cycles", () => {
    const parent = createSession({ id: "parent", kind: "goal", title: "Parent" });
    const child = createSession({ id: "child", kind: "work", title: "Child" });
    const graph = { sessions: [parent, child], edges: [createEdge({ type: "contains", source_session_id: "parent", target_session_id: "child" }), createEdge({ type: "contains", source_session_id: "child", target_session_id: "parent" })], events: [] };
    const validation = validateSessionGraphUpdate(graph);
    expect(validation.valid).toBe(false);
    expect(validation.issues.some((issue) => issue.code === "cycle")).toBe(true);
  });

  it("allows odd mounts and emits warnings instead of rejecting them", () => {
    const source = createSession({ id: "source-app", kind: "app", title: "Large App" });
    const target = createSession({ id: "tiny-goal", kind: "goal", title: "Make task completion reliable" });
    const result = mountSession({ sessions: [source, target], edges: [], events: [] }, { source_session_id: "source-app", target_session_id: "tiny-goal", user_intent: "Find termination behavior.", mount_mode: "unknown", create_adaptation_session: true });
    expect(result.warnings.some((warning) => warning.includes("broader than target"))).toBe(true);
    expect(result.context_projection_delta.exclude_selectors.length).toBeGreaterThan(0);
  });

  it("rejects source policy-blocked mounts", () => {
    const blocked = createSession({ id: "blocked", kind: "repo", title: "Blocked", policy: { allow_mount: false } });
    const target = createSession({ id: "target", kind: "goal", title: "Target", root_id: "root-b" });
    expect(() => mountSession({ sessions: [blocked, target], edges: [], events: [] }, { source_session_id: "blocked", target_session_id: "target", user_intent: "Try blocked mount.", mount_mode: "reference", create_adaptation_session: true })).toThrow("does not allow outbound mounting");
  });

  it("requires authorization for private cross-root projection", () => {
    const privateSource = createSession({ id: "private-source", kind: "repo", title: "Private Source", root_id: "root-a", policy: { visibility: "private" } });
    const target = createSession({ id: "target", kind: "goal", title: "Target", root_id: "root-b" });
    expect(() => mountSession({ sessions: [privateSource, target], edges: [], events: [] }, { source_session_id: "private-source", target_session_id: "target", user_intent: "Project private source.", mount_mode: "reference", create_adaptation_session: true })).toThrow("cross-root projection requires explicit authorization");
    const result = mountSession({ sessions: [privateSource, target], edges: [], events: [] }, { source_session_id: "private-source", target_session_id: "target", user_intent: "Project private source with authorization.", mount_mode: "reference", create_adaptation_session: true, authorization: { allow_private_projection: true, authorized_by: "test" } });
    expect(result.policy_evidence.authorization?.allow_private_projection).toBe(true);
  });

  it("rejects target policy-blocked mounts and adaptations", () => {
    const source = createSession({ id: "source", kind: "repo", title: "Source" });
    const blockedMountTarget = createSession({ id: "blocked-mount-target", kind: "goal", title: "Blocked mount target", policy: { allow_mount: false } });
    const blockedAdaptTarget = createSession({ id: "blocked-adapt-target", kind: "goal", title: "Blocked adapt target", policy: { allow_adapt: false } });
    expect(() => mountSession({ sessions: [source, blockedMountTarget], edges: [], events: [] }, { source_session_id: "source", target_session_id: "blocked-mount-target", user_intent: "Try blocked inbound mount.", mount_mode: "reference", create_adaptation_session: true })).toThrow("does not allow inbound mounts");
    expect(() => mountSession({ sessions: [source, blockedAdaptTarget], edges: [], events: [] }, { source_session_id: "source", target_session_id: "blocked-adapt-target", user_intent: "Try blocked inbound adaptation.", mount_mode: "reference", create_adaptation_session: true })).toThrow("does not allow inbound adaptation");
  });

  it("merges by creating a composition session instead of mutating sources", () => {
    const api = createSession({ id: "api", kind: "repo", title: "agent-core" });
    const web = createSession({ id: "web", kind: "repo", title: "jubilant-goggles" });
    const result = mergeSessions({ source_sessions: [api, web], title: "Agent Platform" });
    expect(result.session.id).not.toBe(api.id);
    expect(result.session.id).not.toBe(web.id);
    expect(result.edges).toHaveLength(2);
    expect(api.title).toBe("agent-core");
    expect(web.title).toBe("jubilant-goggles");
  });
});
