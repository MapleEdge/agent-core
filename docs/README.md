# agent-core docs

## Session platform

- `session-platform-intent.md`: architectural intent for sessions, mounts, adapters, projection, policy, event history, next-action proposals, and control-plane alignment.
- `session-graph.md`: graph records, invariants, mount semantics, replay behavior, and execution boundary.
- `session-adapter-engine.md`: adapter pipeline, preservation model, policy boundary, mapping fallback, projection intent, and implementation rule.
- `session-adapter-implementation-notes.md`: implementation checklist for mount validation, event payloads, fallback mappings, planner boundaries, and control-plane parity.
- `next-action-session-update.md`: next-action proposal shape and stakes/risk semantics.

The session platform docs are normative for future changes. Implementations should preserve source identity, prefer explicit graph structure over destructive mutation, validate policy before applying graph changes, and keep planner-generated session updates advisory until deterministic validation succeeds.
