# Session graph actions in the canonical catalog

`agent-core` now includes session graph actions in the canonical advisory action catalog. These actions are discoverable through `/actions`, validatable through `/actions/validate` and `/actions/validate-plan`, and available to planners when the platform includes them in `allowed_actions`.

## Boundary

`agent-core` remains advisory. It does not apply graph mutations. The platform control plane applies these actions through its session graph service and must still perform visibility, policy, and authorization checks.

## Actions

| Action | Purpose |
| --- | --- |
| `session.mount` | Mount a source session under a target session and optionally create an adapter/projection. |
| `session.mount.preview` | Validate and preview a mount without persistence. |
| `session.adapt` | Create an adapter session and projection scaffold. |
| `session.unmount` | Remove a mounted relationship. |

## Platform execution

The matching platform implementation is expected to apply these through a graph-owned endpoint such as `/api/session-graph/actions/apply`, not through a coding executor, shell command, or mock execution route.
