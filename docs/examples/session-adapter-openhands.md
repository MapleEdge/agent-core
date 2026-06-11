# Example: OpenHands as a mounted reference

This example is an explicit fixture, not a generic fallback. The adapter engine should only produce OpenHands-specific mappings when the source session or fixture supplies those capabilities.

## Scenario B

Source session:

- kind: `repo`
- title: `OpenHands`
- role: `reference_implementation`
- explicit capabilities: shell execution, browser interaction, file editing, agent loop, task completion detection, cancellation handling

Target session:

- kind: `goal`
- title: `Integrate OpenHands executor functionality`
- role: `capability_to_integrate`

Adapter session:

- title: `Adapt OpenHands executor behavior into Integrate OpenHands executor functionality`
- preservation mode: `lossless_reference`
- adaptation mode: `capability_mapping`

Mappings:

- shell execution -> work session executor
- browser interaction -> remote desktop browser workflow
- file editing -> patch/diff tracking
- agent loop -> rolling next-action controller
- task completion detection -> completion evaluator
- cancellation handling -> stop/resume safety

## Scenario C

When the full OpenHands repo is mounted under `Make my executor stop looping`, the projection should include loop termination, completion detection, and cancellation handling only if those capabilities are present on the source session or recovered by repo inspection. It should exclude unrelated UI, deployment, and plugin features.

The warning is intentional: the source is broader than the target, so the adapter uses a focused projection instead of presenting the full source context.
