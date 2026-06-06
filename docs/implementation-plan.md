# Implementation plan

## Phase 1 (this repo)

1. **Memory store** — SQLite-backed CRUD with scope filtering and keyword-based extraction
2. **Context tree** — Default tree per repo, LIKE-based search, cross-repo linking
3. **Action registry** — Default actions seeded, mock execution, risk/approval metadata
4. **Tool rule solver** — Sequence definitions, allowed-next-actions, validate-sequence
5. **Trace store** — Tool-call and skill-run traces linked to sessions
6. **Classifier** — Keyword-based mock returning structured classification
7. **Policy** — Mock policy check with dangerous-action gating
8. **Mock platform** — Fake endpoints for repos, worktrees, executors, commits

## Phase 2 (future)

1. Replace keyword extraction with LLM-powered extraction (mem0 patterns)
2. Replace LIKE search with vector similarity (Chroma adapter)
3. Replace keyword classifier with LLM classifier (Gemini CLI patterns)
4. Add real policy rule engine (Parlant patterns)
5. Add progressive skill learning (cognee patterns)
6. Add OpenAPI spec generation
7. Add authentication middleware
8. Add rate limiting

## Phase 3 (platform integration)

1. Platform calls agent-core APIs instead of mock endpoints
2. Platform manages sessions, worktrees, and executors
3. Platform enforces policy, quotas, and approvals
4. agent-core becomes a dependency of the platform, not a standalone service
