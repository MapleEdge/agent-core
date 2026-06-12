# Session adapter implementation notes

These notes are intended for future implementation work on the SessionAdapter Engine.

## Required behavior

The adapter engine should preserve source identity. It should never rewrite a source session to make it look native to the target. Instead, it should add explicit graph structure.

A mount operation should create or return:

- a mounted edge
- an adapter session when required or requested
- adapter edges
- a context projection
- policy evidence
- warnings
- events

## Required validation

Before persisting a mount, validate:

- source exists
- target exists
- source and target are not the same session
- source outbound mount is allowed
- target inbound mount is allowed
- source outbound adaptation is allowed when creating an adapter
- target inbound adaptation is allowed when creating an adapter
- private cross-root projection has explicit authorization
- edge types are known
- duplicate sessions are rejected
- duplicate edge triples are rejected
- missing parents are rejected
- containment cycles are rejected

## Event payload expectations

During the scaffold phase, event payloads should include created materialized objects where possible.

- `session.created` should include `data.session`
- `session.linked` should include `data.edge`
- `session.mounted` should include `data.edge`
- `session.adapter_created` should include `data.session`
- `session.adapter_projection_created` should include `data.projection`

This keeps replay and debugging useful until a complete event materializer exists.

## Mapping fallback rule

Default mappings must be neutral. Do not hard-code OpenHands, Devin, browser, shell, executor, or vendor-specific capabilities into fallback logic.

Preferred mapping order:

1. explicit source capabilities
2. known source commands
3. inspected evidence
4. neutral scaffold concepts

Neutral scaffold concepts are:

- session summary
- documented capabilities
- known interfaces
- relevant constraints

## Projection rule

Projection should narrow broad sources under focused targets. A repo, app, or container mounted under a goal, work item, or question should receive a focused projection budget and explicit exclusions.

The projection should be conservative when evidence is weak.

## Planner boundary

The next-action planner may propose mounts, adapters, or graph updates. It does not apply them directly. The graph service applies proposals only after validation.
