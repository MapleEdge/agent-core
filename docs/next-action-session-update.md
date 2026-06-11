# Next-action session updates

Next-action output can now carry a `session_update` proposal. This remains
advisory: the model proposes graph changes, and the platform validates and
applies them.

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

## Proposal shape

```json
{
  "classification": "mount_session",
  "active_session_id": "goal-open-terminal",
  "created_sessions": [],
  "created_edges": [],
  "updated_sessions": [],
  "mount_request": {
    "source_session_id": "repo-openhands",
    "target_session_id": "goal-open-terminal",
    "mount_mode": "reference",
    "create_adaptation_session": true,
    "reason": "Reference executor behavior under the active goal."
  },
  "reason": "The next action needs source behavior projected into this goal."
}
```

## Safety boundary

The planner can only propose. The control plane is responsible for policy,
authorization, cycle checks, event append, persistence, and active-session
switching.
