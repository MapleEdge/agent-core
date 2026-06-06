# Future platform contract

This document describes exactly how the future platform will call agent-core.

## Interaction flow

```
Platform                              agent-core
  │                                      │
  │  1. POST /sessions                   │
  │─────────────────────────────────────>│  Create session record
  │                                      │
  │  2. POST /mock-platform/repos/open   │
  │─────────────────────────────────────>│  (Future: platform opens repo)
  │                                      │
  │  3. POST /context/repos/:id/onboard  │
  │─────────────────────────────────────>│  Build context tree for repo
  │                                      │
  │  4. POST /memory/search              │
  │─────────────────────────────────────>│  Retrieve relevant memories
  │                                      │
  │  5. POST /classify/task              │
  │─────────────────────────────────────>│  Classify task intent/type
  │                                      │
  │  6. POST /rules/allowed-next-actions │
  │─────────────────────────────────────>│  Get allowed next actions
  │                                      │
  │  7. POST /actions/validate           │
  │─────────────────────────────────────>│  Validate action schema
  │                                      │
  │  8. POST /mock-platform/policy/check │
  │─────────────────────────────────────>│  (Future: platform authorizes)
  │                                      │
  │  9. Platform executes action         │
  │  (via its own executor routing)      │
  │                                      │
  │  10. POST /traces/tool-call          │
  │─────────────────────────────────────>│  Record trace
  │                                      │
  │  11. POST /memory/extract            │
  │─────────────────────────────────────>│  Extract durable memories
  │                                      │
  │  12. POST /memory/promote            │
  │─────────────────────────────────────>│  Promote memories to wider scope
  │                                      │
  │  13. GET /sessions/:id/timeline      │
  │─────────────────────────────────────>│  Retrieve full session timeline
  │                                      │
```

## Step details

### 1. Platform creates session

The platform creates a session in agent-core when a user starts a new task. The session_id links all events, traces, and memories for that task.

### 2. Platform sends repo opened event

The platform notifies agent-core that a repo has been opened. In phase 1 this is mocked. In production, the platform would provide the actual repo URL, branch, and worktree path.

### 3. Platform asks memory/context for relevant facts

The platform queries agent-core for:
- Memories relevant to the current repo, user, and task
- Context tree nodes for the repo (architecture, commands, known failures, etc.)

This informs the agent's system prompt and working context.

### 4. Platform asks classifier for task classification

The platform sends the user's prompt to the classifier, which returns intent (ask/do), task type, complexity, risk, ambiguity, estimated steps, approval requirements, and suggested action sequence.

### 5. Platform asks rules for allowed next actions

During execution, the platform queries the rule solver to determine what actions the agent is allowed to take next, given the current action and task type.

### 6. Platform asks action registry to validate action schema

Before executing an action, the platform validates the action name and parameters against the registry.

### 7. Platform itself authorizes action

**This is the critical boundary.** The platform — not agent-core — decides whether to allow the action. The platform applies its own policy, quotas, approvals, and audit. agent-core only provides the mock endpoint for testing.

### 8. Platform executes or delegates action

The platform routes the action to the appropriate executor (direct, Aider, OpenHands, etc.). agent-core does not participate in execution in production — it only provides mock execution for testing.

### 9. Platform sends trace back

After execution, the platform records the tool call trace in agent-core for audit and timeline assembly.

### 10. agent-core extracts memory and post-execution lessons

After a session completes, the platform asks agent-core to extract durable memories from the session's events and traces. These are candidate memories that the platform (or user) can promote to wider scopes.

## Key boundaries

- agent-core never executes real actions in production
- agent-core never authorizes — it only recommends and records
- The platform owns the execution loop; agent-core owns the knowledge loop
- Traces flow from platform to agent-core, not the reverse
- Memory promotion decisions may involve platform policy or user approval
