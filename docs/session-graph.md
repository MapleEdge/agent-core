# Session graph

The session graph is an append-only model for durable work context. Zod is the primary schema layer, and JSON Schema exports are available for the control plane and contract tests.

## Core records

`Session`, `SessionEdge`, and `SessionEvent` are the core records. Events include `root_session_id` and `actor`.

## Invariants

- Session IDs must be unique.
- Edge IDs must be unique.
- Duplicate edge triples are rejected.
- Source sessions must exist.
- Target sessions must exist.
- Parent sessions must exist.
- Edge types must be known.
- Containment cycles are rejected.
- Mounting preserves source title, purpose, parent, and history.
- Adapter sessions are required for cross-kind, ambiguous, or non-trivial mounts.
- Context projections must include a budget.
- Policy compatibility is validated before applying graph changes.

## Event replay

`reduceSessionEventsToGraph` recognizes session creation, adapter creation, linked-edge, and mounted-edge payloads. It remains a scaffold until the full event catalog has a materializer.
