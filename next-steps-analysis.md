# agent-core: Current State & Next Steps Analysis

## Current State (base-init @ 51b3c1b0)

### What's built

| Layer | Status | Provider | Quality |
|-------|--------|----------|---------|
| **Memory** (write/search/get/update/delete/extract/promote) | Full CRUD + BM25 FTS + mem0-style metadata filters + LLM extraction (opt-in) | MockMemoryProvider (`mock`) | Solid — 5-signal search, enrichment fields, filter DSL |
| **Context** (onboard/tree/search/link/promote) | Full CRUD | MockContextProvider (`mock`) | Basic — static tree, LIKE search |
| **Sessions** (create/get/timeline/list/close/delete) | Full lifecycle | MockSessionProvider (`mock`) | Good — cascade delete, status transitions |
| **Traces** (tool-call/skill-run/session traces) | Full CRUD | MockTraceProvider (`mock`) | Basic — SQLite store |
| **Actions** (register/list/get/validate/execute) | Full registry + 5-stage pipeline | MockActionProvider (`mock`) | Good — pipeline has scope→lookup→permission→validate→invoke |
| **Rules** (tool-sequence/allowed-next/validate-sequence) | **Real logic** — Letta ToolRulesSolver port | LettaRuleSolverProvider (`direct`) | Strong — 9 rule types, 21 golden fixtures, conditional eval |
| **Classifier** (classify/task) | Mock + opt-in Gemini adapter | MockClassifier / GeminiClassifier (`mock`/`adapter`) | Dual-mode — keyword mock, real LLM when configured |
| **Policy** (match/check/approvals) | Mock pattern matching | MockPolicyMatcherProvider (`mock`) | Basic — static rules |
| **Mock Platform** (repos/worktrees/executors/policy/approvals/commits) | Full contract simulator | N/A | Stable |
| **Auth** | API key middleware (dev mode when unset) | N/A | Good |
| **Rate Limiting** | Sliding window per IP | N/A | Good |
| **OpenAPI** | swagger + swagger-ui at /docs | N/A | Good |

### Test coverage
- 151 tests across 7 files (1970 LOC)
- 21/21 smoke checks
- typecheck + lint clean

### What's real vs. mocked

**Real (production-quality logic):**
1. LettaRuleSolverProvider — full TS port, 9 rule types, deterministic
2. GeminiClassifierProvider — calls real Gemini API with mock fallback
3. DeepSeek LLM client — classify/task + memory/extract (opt-in)
4. 5-stage action pipeline — scope→lookup→permission→validate→invoke
5. Memory FTS + metadata filter DSL
6. Auth + rate limiting middleware
7. OpenAPI spec

**Mocked (simulated):**
1. Memory search — SQLite FTS, no vector embeddings or semantic similarity
2. Context — static tree, no real repo analysis
3. Session — SQLite CRUD, no real session orchestration
4. Trace — SQLite store, no aggregation or analysis
5. Action execution — returns canned responses, no real side effects
6. Policy — string pattern matching, no real guideline evaluation

---

## Recommended Next Steps (ranked by impact × feasibility)

### 1. **LLM-backed memory search (vector embeddings)** — HIGH IMPACT
The biggest functional gap. Memory search is currently SQLite `LIKE`/FTS only.
- **Approach:** Add an embedding provider interface. DeepSeek or a local model generates embeddings on write. Store in SQLite (cosine similarity via JS) or add a Chroma sidecar option.
- **Why now:** Memory search is the #1 use case for the future platform. FTS misses semantic similarity entirely.
- **Effort:** Medium. Interface + DeepSeek embedding adapter + cosine search + migration.

### 2. **Letta-style action schema validation** — MEDIUM IMPACT
ActionProvider currently has an in-memory registry with basic schemas, but the `validate` pipeline stage doesn't do deep Zod-based schema validation against registered action definitions.
- **Approach:** Port Letta's `ToolManager.create_tool()` schema extraction pattern. Each registered action declares a Zod schema. The validate stage checks params against it.
- **Why now:** The pipeline exists but validate is shallow. Real schema validation makes the action boundary trustworthy.
- **Effort:** Low-medium.

### 3. **Parlant-style guideline matching** — MEDIUM IMPACT
PolicyMatcherProvider is currently trivial string matching. Parlant has a sophisticated guideline evaluation engine.
- **Approach:** Port Parlant's `GuidelineMatcher` condition evaluation (not the LLM parts, just the deterministic rule evaluation). Match guidelines against session context.
- **Why now:** Policy matching is the bridge between agent-core and the future platform's authorization.
- **Effort:** Medium.

### 4. **Memory deduplication and conflict resolution** — MEDIUM IMPACT
MockMemoryProvider stores everything written. No dedup, no conflict detection, no memory consolidation.
- **Approach:** Add similarity-based dedup on write (using embeddings from step 1). Add `memory/consolidate` endpoint that merges overlapping memories.
- **Why now:** Without dedup, memory accumulates noise. This is critical for long-running agents.
- **Effort:** Medium (depends on embeddings).

### 5. **Context tree enrichment from real repos** — LOWER IMPACT (for now)
Context is currently a static tree. No actual repo analysis.
- **Approach:** Add a `context/repos/:id/analyze` endpoint that reads a repo fixture and builds a real context tree (files, imports, test coverage map).
- **Why now:** This demonstrates the context layer's value but doesn't block the platform.
- **Effort:** Medium-high.

### 6. **Session summarization** — LOWER IMPACT
Sessions have timeline but no auto-summarization.
- **Approach:** Add LLM-backed session summary generation on `POST /sessions/:id/close`.
- **Why now:** Nice-to-have, not blocking.
- **Effort:** Low.

---

## My Recommendation: Start with #1 (Vector Embeddings for Memory Search)

This is the single highest-impact improvement because:
- Memory search is the most-called endpoint in agent workflows
- FTS cannot find semantically similar content (e.g., "always lint" won't match "run eslint before committing")
- It proves the `MemoryProvider` interface works for real backend swaps
- It enables dedup (#4) as a follow-on
- It stays within agent-core's scope (no platform integration needed)

**Implementation plan:**
1. Add `EmbeddingProvider` interface (`embed(texts: string[]) → number[][]`)
2. Add `DeepSeekEmbeddingClient` (or use a lightweight local model)
3. Add `memory_embeddings` table (id, memory_id, vector BLOB)
4. Update `MockMemoryProvider.search()` to use cosine similarity when embeddings available, FTS fallback
5. Add hybrid scoring: `0.7 * cosine_score + 0.3 * bm25_score`
6. Gate behind `ENABLE_VECTOR_SEARCH=true` env var
7. Update docs + tests
