# Memory Roadmap

## Architecture

```text
MemoryProvider (interface)
 ├─ SQLiteHybridMemoryProvider — default native SQLite memory backend
 └─ Mem0MemoryProvider         — optional mem0 adapter via embedded worker or REST
```

## Current State

`SQLiteHybridMemoryProvider` is the default memory backend. It is native to agent-core and provides:

- SQLite-backed memory CRUD
- FTS5/BM25 keyword search
- Vector-style similarity search using the configured embedding provider
- Hybrid retrieval scoring
- Metadata filtering
- Deterministic local testability

`Mem0MemoryProvider` is retained as a high-capability reference and optional adapter. It delegates to mem0 through a transport layer:

- Embedded Python worker by default
- REST sidecar when `MEM0_TRANSPORT=rest` or `MEM0_BASE_URL` is set

mem0 remains useful for comparison because upstream mem0 includes LLM-driven extraction, semantic retrieval, entity-aware recall, deduplication, consolidation, and procedural-memory patterns.

## Provider Selection

```env
MEMORY_PROVIDER=sqlite   # default — native SQLite hybrid backend
MEMORY_PROVIDER=mem0     # optional — embedded worker by default, REST fallback available
```

For mem0 transport details, see `docs/memory.md`.

## Replacement Direction

The previous roadmap treated mem0 as the primary production backend to be replaced later. That is no longer accurate. The native SQLite hybrid provider is now the default substrate. The roadmap is now to improve the native provider until it covers the useful mem0-inspired capabilities directly.

| Component | Current Owner | Target Owner | Status |
|-----------|--------------|--------------|--------|
| Memory CRUD | agent-core | agent-core | Done |
| FTS search (BM25) | agent-core | agent-core | Done |
| Vector-style similarity search | agent-core | agent-core | Prototype |
| Hybrid retrieval scoring | agent-core | agent-core | Active |
| Metadata filtering | agent-core | agent-core | Active |
| Fact extraction | keyword/LLM path | agent-core | Partial |
| Deduplication | agent-core/mem0 reference | agent-core | Planned |
| Entity extraction | mem0 reference | agent-core | Planned |
| Consolidation | mem0 reference | agent-core | Planned |
| Procedural memory | mem0 reference | agent-core | Planned |

## Benchmark Gate

A native memory subsystem should not replace a mem0-inspired capability unless it passes retrieval and latency gates against current baselines.

```text
Recall@1  >= baseline
Recall@3  >= baseline
Recall@5  >= baseline
MRR       >= baseline
nDCG@5    >= baseline
```

AND:

```text
Search latency p95 <= baseline x 1.2
Write latency p95  <= baseline x 1.2
```

For early retrieval-substrate work, do not gate on long-memory benchmarks such as LoCoMo, LongMemEval, or BEAM. Those are later-stage benchmarks for extraction, consolidation, temporal reasoning, multi-hop recall, and scale.

## Process

1. Implement or improve the native component.
2. Run `pnpm memory:eval` against the default provider.
3. Optionally run `MEMORY_PROVIDER=mem0 pnpm memory:eval` for comparison.
4. Compare JSON reports.
5. Promote only the components that meet the benchmark gate and operational requirements.

## Running Benchmarks

```bash
# Default native provider
pnpm memory:eval > native-baseline.json

# Optional mem0 comparison, embedded worker by default
MEMORY_PROVIDER=mem0 pnpm memory:eval > mem0-baseline.json

# Optional mem0 REST comparison
MEMORY_PROVIDER=mem0 MEM0_TRANSPORT=rest MEM0_BASE_URL=http://localhost:8000 pnpm memory:eval > mem0-rest-baseline.json
```

## Feature Flags for Hybrid Strategy

Individual memory subsystems can be configured independently where implemented:

```env
MEMORY_EXTRACTION_PROVIDER=mem0     # optional LLM fact extraction reference path
MEMORY_RETRIEVAL_PROVIDER=native    # native retrieval path
MEMORY_DEDUP_PROVIDER=native        # native dedup path once implemented
```

These flags are migration levers, not proof that mem0 owns the primary runtime.

## Timeline

| Phase | Milestone | Criteria |
|-------|-----------|----------|
| **Now** | Native SQLite hybrid as default | CRUD, FTS, vector-style search, hybrid scoring, metadata filters |
| **Sprint 2** | Retrieval substrate hardening | Recall@K, MRR, nDCG, latency, fallback, filter correctness |
| **Sprint 3** | Extraction and dedup hardening | Durable fact extraction, duplicate suppression, update history |
| **Sprint 4** | Consolidation and procedural memory | Conflict handling, procedural memories, session-derived lessons |
| **Future** | Long-memory evaluation | LoCoMo/LongMemEval/BEAM-style benchmarks when the required capabilities exist |
