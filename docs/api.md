# API reference

Base URL: `http://localhost:3210`

## Health

### `GET /health`
Returns `{ "status": "ok", "service": "agent-core" }`

---

## Memory

### `POST /memory/write`
Write a new memory entry.
```json
{ "scope": "repo", "scope_id": "my-repo", "content": "Always run tests before committing", "metadata": {} }
```
Returns: `{ "id": "...", "scope": "repo", "scope_id": "my-repo" }` (201)

### `POST /memory/search`
Search memories by content substring.
```json
{ "query": "tests", "scope": "repo", "limit": 10 }
```
Returns: `{ "results": [...] }`

### `POST /memory/extract`
Extract candidate durable memories from text.
```json
{ "session_id": "...", "text": "We should always run lint before committing." }
```
Returns: `{ "session_id": "...", "candidates": [{ "content": "...", "confidence": 0.75 }] }`

### `POST /memory/promote`
Copy a memory to a wider scope.
```json
{ "memory_id": "...", "target_scope": "global_policy", "target_scope_id": "" }
```
Returns: `{ "id": "...", "promoted_from": "...", "scope": "global_policy" }`

### `GET /memory/:memory_id`
Get a single memory by ID.

### `PATCH /memory/:memory_id`
Update a memory's content or metadata.
```json
{ "content": "Updated content" }
```

### `DELETE /memory/:memory_id`
Delete a memory. Returns 204.

---

## Context

### `POST /context/repos/:repo_id/onboard`
Create a default context tree for a repo. Returns 201 if new, 200 if already onboarded.

### `GET /context/repos/:repo_id/tree`
Get the full context tree for a repo.

### `POST /context/search`
Search context nodes.
```json
{ "repo_id": "demo", "query": "tests" }
```

### `POST /context/link`
Link two context nodes across repos.
```json
{ "source_repo": "a", "source_path": "repo/tests", "target_repo": "b", "target_path": "repo/tests", "relation": "related" }
```

### `POST /context/promote`
Update a context node's content.
```json
{ "repo_id": "demo", "path": "repo/overview", "content": "A demo repository" }
```

---

## Sessions

### `POST /sessions`
Create a new session. `{ "repo_id": "demo" }`

### `GET /sessions/:session_id`
Get session details.

### `POST /sessions/:session_id/events`
Record a session event.
```json
{ "event_type": "prompt", "data": { "text": "Fix the login test" } }
```

### `GET /sessions/:session_id/timeline`
Get all events and traces for a session, ordered chronologically.

---

## Traces

### `POST /traces/tool-call`
Record a tool call trace.
```json
{ "session_id": "...", "action_name": "read_file", "input": { "path": "..." }, "output": { "content": "..." }, "duration_ms": 42 }
```

### `POST /traces/skill-run`
Record a skill run trace.
```json
{ "session_id": "...", "skill_name": "lint-fix", "input": {}, "output": {}, "duration_ms": 100 }
```

### `GET /traces/session/:session_id`
Get all traces for a session.

---

## Actions

### `POST /actions/register`
Register a new action.
```json
{ "name": "my_action", "description": "Does something", "risk_level": "medium", "requires_approval": false }
```

### `GET /actions`
List all registered actions.

### `GET /actions/:action_name`
Get a single action by name.

### `POST /actions/validate`
Validate an action name and parameters.
```json
{ "action_name": "read_file", "params": { "path": "src/index.ts" } }
```

### `POST /actions/execute`
Execute an action (mocked). Returns approval-required if the action is gated.
```json
{ "action_name": "read_file", "params": { "path": "src/index.ts" } }
```

---

## Rules

### `POST /rules/tool-sequence`
Define a tool sequence rule.
```json
{ "task_type": "code_edit", "sequence": ["classify_task", "read_file", "grep", "write_file", "run_tests", "summarize_diff"], "before_exit": ["summarize_diff"], "approval_required": ["commit"] }
```

### `GET /rules/tool-sequence/:rule_id`
Get a rule by ID.

### `POST /rules/allowed-next-actions`
Get allowed next actions given current state.
```json
{ "task_type": "code_edit", "current_action": "classify_task" }
```

### `POST /rules/validate-sequence`
Validate a proposed sequence against rules.
```json
{ "task_type": "code_edit", "proposed_sequence": ["classify_task", "read_file", "write_file"] }
```

---

## Classifier

### `POST /classify/task`
Classify a task prompt.
```json
{ "prompt": "Fix a failing login test" }
```
Returns intent, task_type, complexity_score, risk_score, ambiguity_score, estimated_steps, requires_approval, suggested_sequence, reasoning.

---

## Policy

### `POST /policy/match`
Match an action against policy rules.
```json
{ "action_name": "commit", "scope": "global" }
```

### `POST /mock-platform/policy/check`
Mock platform policy check.
```json
{ "session_id": "...", "action_name": "commit" }
```

### `POST /mock-platform/approvals/request`
Request mock approval.
```json
{ "session_id": "...", "action_name": "commit", "reason": "Ready to commit fix" }
```

---

## Mock platform

### `POST /mock-platform/repos/open`
```json
{ "repo_url": "https://github.com/org/repo", "branch": "main" }
```

### `POST /mock-platform/worktrees/create`
```json
{ "repo_id": "repo-abc", "branch": "fix/login" }
```

### `POST /mock-platform/executors/select`
```json
{ "task_type": "code_edit", "complexity_score": 60 }
```

### `POST /mock-platform/commits/mock`
```json
{ "session_id": "...", "repo_id": "demo", "message": "fix login test", "files": ["src/auth.ts"] }
```
