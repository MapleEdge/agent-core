# Next-action session updates

Next-action output can carry a `session_update` proposal. This remains advisory: the model proposes graph changes, and the platform validates and applies them.

For platform-level rationale, see `docs/session-platform-intent.md`.

## Intent

The next-action planner should be allowed to notice that the active session structure is wrong for the user's current intent. It can propose a child session, sibling session, parent session, mount, adapter, merge, split, or active-session switch.

The planner does not own graph mutation. It emits a structured proposal. The platform validates the proposal against schemas, policy, authorization, cycle checks, duplicate checks, and persistence rules before applying it.

This split keeps the planning layer flexible while keeping graph integrity deterministic.

## Classifications

- `no_change`
- `continue_active`
- `create_child`
- `create_sibling`
- `create_parent`
- `merge_sessions`
- `split_session`
- `switch_active`
- `question_only`
- `mount_session`
- `adapt_session`
- `unmount_session`
- `update_adapter`

## Action stakes

`stakes` is not a severity field. It describes what class of side effect the next action may have:

- `read_only`
- `execution`
- `modification`
- `external_side_effect`

`risk` remains the severity field:

- `low`
- `medium`
- `high`

## Proposal shape

```json
{
  "classification": "mount_session",
  "active_session_id": "goal-open-terminal",
  "created_sessions": [],
  "created_edges": [],
  "updated_sessions": [],
  "mount_request": {
    "source_session_id": "repo-reference",
    "target_session_id": "goal-open-terminal",
    "user_intent": "Reference executor behavior under the active goal.",
    "mount_mode": "reference",
    "create_adaptation_session": true,
    "make_active": false,
    "reason": "Reference executor behavior under the active goal."
  },
  "reason": "The next action needs source behavior projected into this goal."
}
```

## Safety boundary

The planner can only propose. The control plane is responsible for policy, authorization, cycle checks, event append, persistence, and active-session switching.

`mount_request` uses the executable mount request schema so it can be passed to the mount engine after platform authorization. `reason` is optional proposal metadata for audit or UI display.

## Implementation rule

Keep next-action output narrow and machine-verifiable. Avoid free-form graph mutation instructions when a typed proposal can express the operation.
