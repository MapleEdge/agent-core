# Phase 1 scope

## In scope

- Memory write/search/extract/promote/get/patch/delete
- Context tree onboarding, search, linking, promotion
- Action registry with default actions
- Action validation and mock execution
- Tool rule solver (sequences, allowed-next, validate)
- Session creation and event recording
- Trace recording (tool-call, skill-run)
- Session timeline retrieval
- Task classifier (mock, keyword-based)
- Policy matching and mock policy check
- Mock platform endpoints (repos, worktrees, executors, policy, approvals, commits)
- Provider vendoring with metadata
- Complete documentation
- Smoke test proving end-to-end flow without real platform

## Out of scope

- Real platform UI
- Real worktree management
- Real executor routing (Aider, OpenHands, direct)
- Real browser automation
- Real deployment pipelines
- Real payment or provider signup
- Production authentication and authorization
- Distributed runners or job scheduling
- LLM-powered memory extraction (uses keyword heuristics for now)
- LLM-powered task classification (uses keyword heuristics for now)
- Vector similarity search (uses SQL LIKE for now)
- Real policy enforcement (mock only)
- Multi-tenant isolation
- Rate limiting or quotas
