# Platform Boundary

## agent-core

Owns:
- memory
- retrieval
- context
- action catalog
- action schemas
- rule solver
- planning
- advisory policy matching

Does not own:
- shell execution
- OpenHands execution
- commits
- pull requests
- deployments
- approvals
- runtime authorization

## jubilant-goggles

Owns:
- sessions
- worktrees
- OpenHands orchestration
- executor routing
- approvals
- runtime validation
- timeline events
- commits and PRs
