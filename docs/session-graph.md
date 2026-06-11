# Session graph

The session graph is an append-only model for durable work context. Zod is the primary schema layer, and JSON Schema exports are available for the control plane and contract tests.

## Core records

`Session`

- `id`
- `kind`
- `title`
- `summary`
- `status`
- `parent_id`
- `root_id`
- `facets`
- `policy`
- `state`
- `metadata`
- `created_at`
- `updated_at`
- `created_from_event_id`

`SessionEdge`

- `id`
- `type`
- `source_session_id`
- `target_session_id`
- `metadata`
- `created_at`
- `created_from_event_id`

`SessionEvent`

- `id`
- `type`
- `session_id`
- `root_session_id`
- `actor`
- `data`
- `created_at`

## Invariants

- Session IDs must be unique.
- Edge IDs must be unique.
- Duplicate edge triples are rejected.
- Source sessions must exist.
- Target sessions must exist.
- Parent sessions must exist.
- Edge types must be known.
- Containment cycles are rejected.
- Mounting never rewrites title, purpose, parent, or history.
- Adapter sessions are required for cross-kind, ambiguous, or non-trivial mounts.
- Context projections must include a budget.
- Policy compatibility is validated before applying graph changes.

Odd mounts are allowed when graph integrity and policy allow them. They should produce warnings rather than hard failures.

Private cross-root projection is blocked unless explicit authorization is present on the mount request.

## Event replay

`reduceSessionEventsToGraph` is a replay scaffold. It recognizes session creation, adapter creation, linked-edge, and mounted-edge payloads. A later reducer can apply the full event catalog while preserving append-only replay semantics.
