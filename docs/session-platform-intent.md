# Session platform intent

This document records the architectural intent behind the session graph and SessionAdapter Engine. It should be treated as a design constraint for future implementation work.

## Core intent

The platform treats every meaningful unit of work as a session. A repository, goal, task, question, runtime, validation run, adapter, and application can all be represented as sessions. This gives the platform one durable abstraction for planning, memory, context projection, execution state, and provenance.

The goal is not to force every session to have the same internal shape. The goal is to make every session addressable, composable, mountable, auditable, and recoverable through one graph model.

## Why everything is a session

A user may work across repositories, application surfaces, agent runs, and narrow goals. Those objects usually live at different scales, but the platform needs to move context between them without losing the user's intent.

Examples:

- A repo session can represent a complete external project.
- A goal session can represent a small intent such as fixing executor termination.
- A work session can represent one implementation thread.
- An adapter session can represent the semantic bridge between unrelated sessions.
- An app session can compose backend, frontend, runtime, validation, and documentation sessions.

This model lets the platform answer questions such as: what context is active, where did it come from, what policy applies, what was adapted, what was excluded, and what should happen next.

## Semantic preservation

Moving or mounting a session must not erase its original identity. A broad source can be mounted under a narrow target, even when the relationship looks strange. The platform records that relationship explicitly instead of mutating the source.

The preservation rule is:

- keep the source session intact
- create edges to describe placement or relationship
- create an adapter session when interpretation is required
- create context projections to control what is visible to execution
- append events so the operation can be replayed and audited

The adapter exists because mount intent is not always a direct dependency. It can be a reference, comparison, template, migration source, wrapper target, vendor import, or ambiguous user intent.

## Adapter intent

The SessionAdapter Engine should make semantically odd operations safe and useful. For example, a user can mount a large repo under a tiny goal. The engine should not reject that solely because the scale mismatch looks unusual. It should preserve the source, create a warning, and project only the relevant context into the target.

The adapter should not invent vendor-specific capabilities. It should seed mappings from explicit repo capabilities, known commands, inspected evidence, or neutral scaffold concepts. Vendor-specific mappings belong in fixtures or inspection output, not in default fallback behavior.

## Context projection intent

Context projection is the boundary between graph memory and execution context. It decides what portion of a source is relevant to a target.

A projection should include:

- active session id
- source session ids
- projection mode
- projection source
- relevance score
- evidence
- include selectors
- exclude selectors
- budget
- rationale

A broad source mounted under a focused target should receive a smaller budget and explicit exclusions. This prevents unrelated UI, deployment, plugin, or historical noise from flooding the next action.

## Policy intent

Policy is part of the graph, not an afterthought. A mount or adaptation can only proceed after source and target policy are checked.

The platform should distinguish:

- source outbound mount permission
- target inbound mount permission
- source outbound adaptation permission
- target inbound adaptation permission
- visibility constraints
- security constraints
- license constraints
- explicit authorization for private cross-root projection

Policy evidence should travel with the mount result so downstream execution can explain why a context transfer was allowed.

## Event intent

The graph is intended to be append-only. Services may materialize state for fast reads, but events should preserve the operation history.

Important event payloads should include the created session or edge object when practical. This keeps event replay useful during the scaffold phase and reduces ambiguity between proposal, preview, and committed graph state.

## Next-action intent

The next-action planner may propose session updates, but the platform applies them only after validation. The planner does not own graph integrity. It proposes; the graph service validates policy, cycle invariants, duplicate records, persistence, and active-session changes.

`stakes` describes side-effect class, not severity. `risk` describes severity.

## Control-plane intent

The control plane should expose these semantics without weakening them. API endpoints, UI panels, workers, and persistence should all preserve the same distinction between source identity, target context, adapter interpretation, policy evidence, and projection budget.

A UI may make session movement feel simple, but the backend should still record exact intent and graph evidence.

## Non-goals

The session graph is not intended to be a loose tag system. Edges must preserve explicit semantics.

The adapter is not intended to rewrite source history.

The projection system is not intended to expose all context by default.

The planner is not intended to bypass graph policy.

## Implementation direction

`agent-core` owns the portable TypeScript contracts, schema definitions, validation logic, and pure engine behavior. Other surfaces should align to these contracts rather than creating incompatible session semantics.
