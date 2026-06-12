# agent-core docs

## Session platform

- `session-platform-intent.md`: architectural intent for sessions, mounts, adapters, projection, policy, and event history.
- `session-graph.md`: graph records, invariants, mount semantics, replay behavior, and execution boundary.
- `session-adapter-engine.md`: adapter pipeline, preservation model, policy boundary, mapping fallback, and projection intent.
- `session-adapter-implementation-notes.md`: implementation checklist for mount validation, event payloads, fallback mappings, and planner boundaries.
- `next-action-session-update.md`: next-action proposal shape and stakes/risk semantics.

The session platform docs are normative for future changes. Implementations should preserve source identity, prefer explicit graph structure over destructive mutation, and validate policy before applying graph changes.
