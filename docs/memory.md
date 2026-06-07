# Memory System

## Overview

agent-core's memory system is a pluggable provider architecture. Memory consumers interact with a single `MemoryProvider` interface regardless of which backend is active.

```text
API routes (memory/write, memory/search, ...)
  └─ getProvider("memory")
       ├─ MockMemoryProvider   — SQLite FTS, keyword matching
       └─ Mem0MemoryProvider   — mem0 REST API (LLM extraction, hybrid search)
```

## Provider Selection

Set via environment variable:

```env
MEMORY_PROVIDER=mock     # default — no external deps
MEMORY_PROVIDER=mem0     # requires MEM0_BASE_URL
```

### Mock Provider (default)

- SQLite-backed CRUD
- FTS5 full-text search
- Metadata filtering (eq, ne, in, nin, gt, gte, lt, lte, contains, icontains)
- AND/OR/NOT logical combinators
- No LLM calls, no external services

### Mem0 Provider

- Delegates to a running mem0 server via REST API
- LLM-driven fact extraction on write
- Hybrid BM25 + vector semantic search
- Entity extraction and entity boost scoring
- Hash-based memory deduplication
- Configurable reranking

Configuration:

```env
MEMORY_PROVIDER=mem0
MEM0_BASE_URL=http://localhost:8000
MEM0_API_KEY=your-api-key          # optional, for authenticated access
MEM0_USER_ID=agent-core            # default scope identifier
```

## Feature Flags

Individual memory subsystems can be independently configured for hybrid strategies:

```env
MEMORY_EXTRACTION_PROVIDER=mem0     # LLM-based fact extraction
MEMORY_RETRIEVAL_PROVIDER=mem0      # Hybrid search
MEMORY_DEDUP_PROVIDER=mem0          # Deduplication
```

## Memory Provider Interface

```typescript
interface MemoryProvider {
  readonly name: string;
  readonly status: ProviderStatus;

  write(params: MemoryWriteParams): Promise<MemoryRecord>;
  search(params: MemorySearchParams): Promise<MemorySearchResult[]>;
  get(id: string): Promise<MemoryRecord | null>;
  update(id: string, params: MemoryUpdateParams): Promise<MemoryRecord | null>;
  delete(id: string): Promise<boolean>;
}
```

## Scope Mapping

agent-core uses `scope`/`scope_id` pairs. mem0 uses `user_id`/`agent_id`/`run_id`.

The mapping layer (`src/memory/mappers/mem0Mapper.ts`) translates between them:

| agent-core scope | mem0 entity |
|-----------------|-------------|
| `user` | `user_id` |
| `agent` | `agent_id` |
| `session` | `run_id` |
| `repo` | `user_id: "repo:<scope_id>"` |
| other | `user_id: "<scope>:<scope_id>"` |

Agent-core metadata extensions (kind, facts, concepts, file lists) are preserved via `_ac_` prefixed keys in mem0 metadata, stripped on read.

## Benchmarking

Run the memory quality eval harness:

```bash
pnpm memory:eval
```

Output is a JSON report with Recall@1/3/5, MRR, nDCG@5, and per-category breakdowns.

Compare providers:

```bash
# Mock baseline
pnpm memory:eval > mock.json

# Mem0 (requires running server)
MEMORY_PROVIDER=mem0 MEM0_BASE_URL=http://localhost:8000 pnpm memory:eval > mem0.json

diff mock.json mem0.json
```

## Files

| File | Purpose |
|------|---------|
| `src/providers/MemoryProvider.ts` | Interface definition |
| `src/providers/mocks/MockMemoryProvider.ts` | SQLite-backed mock |
| `src/providers/adapters/Mem0MemoryProvider.ts` | mem0 REST adapter |
| `src/memory/mappers/mem0Mapper.ts` | Scope/metadata mapping |
| `src/memory/routes.ts` | HTTP endpoints |
| `scripts/memory-eval.ts` | Benchmark harness |
| `tests/fixtures/memory-retrieval-benchmarks.json` | Benchmark fixtures |
| `docs/memory-roadmap.md` | Replacement strategy |
| `docs/memory/upstream-tracking.md` | Upstream version tracking |

## See Also

- [Memory Roadmap](memory-roadmap.md) — replacement strategy and benchmark gate
- [Upstream Tracking](memory/upstream-tracking.md) — mem0 version management
