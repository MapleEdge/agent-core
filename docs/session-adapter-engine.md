# SessionAdapter Engine

The SessionAdapter Engine is a pure service scaffold for contextual mounts and adaptations.

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

## Policy boundary

The engine validates source outbound mount/adapt rights and target inbound mount/adapt rights. Private cross-root projection is blocked unless the mount request carries explicit authorization.

License and security constraints are carried into policy evidence and adapter constraints so downstream execution can preserve them.

## Mapping fallback

Mapping generation is seeded from explicit repo capabilities first, then known commands. If neither exists, the engine emits neutral scaffold concepts such as session summary, documented capabilities, known interfaces, and relevant constraints. It must not infer vendor-specific capabilities unless they are present in the source session or recovered by inspection.

## Current limitations

- Role inference is heuristic.
- Mapping generation is seeded from repo capabilities or known commands when available, otherwise from neutral scaffold concepts.
- Event reduction is a replay scaffold, not a full materializer.
- Effective policy inheritance requires callers to provide parent chains when policy needs to be computed across ancestry.
