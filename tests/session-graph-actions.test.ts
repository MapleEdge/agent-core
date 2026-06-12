import { describe, expect, it, beforeAll } from "vitest";
import { CANONICAL_ACTION_MAP, CANONICAL_ZOD_SCHEMAS } from "../src/actions/catalog/canonicalActions.js";
import { hydrateCanonicalSchemas } from "../src/actions/catalog/seedCanonicalActions.js";

beforeAll(() => {
  hydrateCanonicalSchemas();
});

describe("session graph canonical actions", () => {
  it("registers mount, preview, adapt, and unmount actions", () => {
    expect(CANONICAL_ACTION_MAP.has("session.mount")).toBe(true);
    expect(CANONICAL_ACTION_MAP.has("session.mount.preview")).toBe(true);
    expect(CANONICAL_ACTION_MAP.has("session.adapt")).toBe(true);
    expect(CANONICAL_ACTION_MAP.has("session.unmount")).toBe(true);
  });

  it("validates session.mount params with the graph request shape", () => {
    const schema = CANONICAL_ZOD_SCHEMAS["session.mount"];
    const result = schema!.safeParse({
      source_session_id: "repo-session",
      target_session_id: "goal-session",
      user_intent: "Use repo context for this goal.",
      mount_mode: "reference",
      create_adaptation_session: true,
      make_active: false,
    });

    expect(result.success).toBe(true);
  });

  it("rejects incomplete session.mount params", () => {
    const schema = CANONICAL_ZOD_SCHEMAS["session.mount"];
    const result = schema!.safeParse({
      source_session_id: "repo-session",
      mount_mode: "reference",
      create_adaptation_session: true,
    });

    expect(result.success).toBe(false);
  });
});
