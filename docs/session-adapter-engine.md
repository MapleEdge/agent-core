# SessionAdapter Engine

The SessionAdapter Engine is a pure service scaffold for contextual mounts and
adaptations.

## Pipeline

1. Resolve source session.
2. Resolve target session.
3. Infer source role.
4. Infer target role.
5. Determine mount mode.
6. Create an adaptation session when requested or required.
7. Create semantic mappings.
8. Create graph edges.
9. Generate context projection rules.
10. Validate policy and cycle invariants.
11. Append events.

## Mount result

`mountSession` returns:

- `mounted_edge`
- optional `adaptation_session`
- `adaptation_edges`
- `context_projection_delta`
- `warnings`
- `events`

## Preservation model

The mounted source remains unchanged. The mounted edge records contextual
placement, and the adapter session records interpretation.

For a broad source mounted under a tiny goal, the projection uses a smaller
budget and excludes unrelated UI, deployment, plugin, and historical-noise
selectors.

## Current limitations

- Role inference is heuristic.
- Mapping generation is seeded from repo capabilities or default behavior names.
- Event reduction is a replay scaffold, not a full materializer.
- Policy validation handles source and target mount/adapt allowance, visibility
  warnings, license carry-through, and security constraints.
