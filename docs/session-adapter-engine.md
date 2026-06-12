# SessionAdapter Engine

The SessionAdapter Engine is a pure service scaffold for contextual mounts and adaptations.

For platform-level rationale, see `docs/session-platform-intent.md`.

## Intent

The engine exists because session relationships are not always clean dependency edges. A user may want to place a large external repo under a small goal, compare one project against another, wrap a component, port behavior, vendor a source, or use a repo as a design reference.

The engine makes these operations explicit instead of destructive. It preserves source identity, records the user's intent, creates adapter semantics, and projects only relevant context into the target.

## Pipeline

1. Resolve source session.
2. Resolve target session.
3. Validate source and target policy.
4. Infer source role.
5. Infer target role.
6. Determine mount mode.
7. Create an adaptation session when requested or required.
8. Create semantic mappings.
9. Create graph edges.
10. Generate context projection rules.
11. Validate graph integrity and cycle invariants.
12. Append events.

## Mount result

`mountSession` returns:

- `mounted_edge`
- optional `adaptation_session`
- `adaptation_edges`
- `context_projection_delta`
- `policy_evidence`
- `warnings`
- `events`

## Preservation model

The mounted source remains unchanged. The mounted edge records contextual placement, and the adapter session records interpretation.

For a broad source mounted under a focused goal, the projection uses a smaller budget and excludes unrelated UI, deployment, plugin, and historical-noise selectors.

Preservation means the engine should never rewrite the source session to make it fit the target. It should add graph structure around the source.

## Policy boundary

The engine validates source outbound mount/adapt rights and target inbound mount/adapt rights. Private cross-root projection is blocked unless the mount request carries explicit authorization.

License and security constraints are carried into policy evidence and adapter constraints so downstream execution can preserve them.

The policy boundary is intentional. A semantically valid mount is still invalid when policy blocks it.

## Mapping fallback

Mapping generation is seeded from explicit repo capabilities first, then known commands. If neither exists, the engine emits neutral scaffold concepts such as session summary, documented capabilities, known interfaces, and relevant constraints. It must not infer vendor-specific capabilities unless they are present in the source session or recovered by inspection.

Fallback mappings are hypotheses. They are meant to make the adapter inspectable, not to claim implementation certainty.

## Projection intent

A projection is the executable context boundary. It should explain what is included, what is excluded, how large the context budget is, and why the source is relevant to the target.

When a source is much broader than the target, the projection should narrow aggressively. This is what lets the platform support radical graph operations without flooding the action planner with unrelated context.

## Current limitations

- Role inference is heuristic.
- Mapping generation is seeded from repo capabilities or known commands when available, otherwise from neutral scaffold concepts.
- Event reduction is a replay scaffold, not a full materializer.
- Effective policy inheritance requires callers to provide parent chains when policy needs to be computed across ancestry.

## Implementation rule

Prefer adding explicit graph structure over mutating existing sessions. When in doubt, create an adapter session, attach evidence, and make the projection conservative.
