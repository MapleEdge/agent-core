# ADR 0003: Memory–action–platform boundary

## Status
Accepted

## Context
The most critical architectural decision is where to draw the boundary between the memory/action service and the future platform. If agent-core can execute real actions, it becomes a security risk. If it cannot, the platform must handle all execution.

## Decision
agent-core is advisory only. It may:
- Store and retrieve memories
- Organize context trees
- Register and validate actions
- Determine allowed action sequences
- Record traces
- Classify tasks
- Match policy rules

It must not:
- Execute real filesystem operations outside demo fixtures
- Push code, create commits, or manage branches
- Deploy or provision infrastructure
- Access secrets or credentials
- Spend money or interact with payment systems
- Grant approvals (it may request them; the platform grants them)

The future platform is the only component that:
- Authorizes action execution
- Routes to real executors
- Enforces policy, quotas, and approvals
- Manages authentication and multi-tenancy
- Performs audit logging

## Consequences
- agent-core is safe to run in development without risk of real-world side effects.
- The platform must implement its own execution and authorization layer.
- Mock platform endpoints in agent-core simulate the platform boundary for testing.
- Memory promotion across scopes is an advisory recommendation; the platform decides whether to apply it.
- This boundary creates a clear contract that both sides can develop against independently.
