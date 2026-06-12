# Session graph

The session graph is an append-only model for durable work context. Zod is the primary schema layer, and JSON Schema exports are available for the control plane and contract tests.

For platform-level rationale, see `docs/session-platform-intent.md`.

## Intent

The graph gives the platform one durable abstraction for repositories, goals, work sessions, app compositions, adapters, runtimes, validation runs, and questions. The intent is to make each unit addressable and composable without flattening its meaning.

A session can be broad, such as an entire repository, or narrow, such as a single goal. The graph allows these sessions to be related while preserving their original identity and history.

## Core records

`Session`, `SessionEdge`, and `SessionEvent` are the core records. Events include `root_session_id` and `actor`.

A session records identity, kind, title, summary, status, hierarchy, facets, policy, mutable state, metadata, timestamps, and the event that created it.

An edge records an explicit relationship between two sessions. Edge semantics matter. A `mounted_under` edge is not the same as a `depends_on`, `references`, `component_of`, or `adapted_under` edge.

An event records why graph state exists. Services may materialize sessions and edges for fast reads, but event history should remain the audit trail.

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

## Mount semantics

Mounting is contextual placement, not mutation. A source session mounted under a target session keeps its identity. The mount creates an edge, optional adapter session, projection, policy evidence, warnings, and events.

Odd mounts are allowed when policy and graph integrity allow them. A repo can be mounted under a tiny goal, but the adapter and projection must make the semantic boundary explicit.

## Event replay

`reduceSessionEventsToGraph` recognizes session creation, adapter creation, linked-edge, and mounted-edge payloads. It remains a scaffold until the full event catalog has a materializer.

Important event payloads should include the created session or edge object where practical. This keeps replay useful while the persistence layer is still evolving.

## Boundary with execution

The graph does not execute actions. It supplies structured context, policy evidence, projections, and relationships to the planner and execution layer. The planner may propose graph updates, but the graph service owns validation and persistence.
