# Memory Roadmap

## Architecture

```text
MemoryProvider (interface)
 ├─ MockMemoryProvider       — SQLite FTS, keyword search, mock mode
 └─ Mem0MemoryProvider       — mem0 REST API adapter, production mode
```

## Current State

**Mem0MemoryProvider** is the highest-capability memory backend.

It provides:
- LLM-driven fact extraction on write
- Hybrid BM25 + vector semantic search
- Entity extraction and entity boost scoring
- Hash-based memory deduplication
- Optional reranking

**MockMemoryProvider** is retained for:
- Unit and integration testing (no external deps)
- Benchmarking baseline
- Fallback when mem0 is unavailable
- Future native implementation development

## Provider Selection

```env
MEMORY_PROVIDER=mock     # default — SQLite-backed mock
MEMORY_PROVIDER=mem0     # requires MEM0_BASE_URL
```

## Future: Native Components

The roadmap for replacing mem0 subsystems with native implementations:

| Component | Current Owner | Target Owner | Status |
|-----------|--------------|-------------|--------|
| Memory CRUD | agent-core (SQLite) | agent-core | Done |
| FTS search (BM25) | agent-core (FTS5) | agent-core | Done |
| Vector search | mem0 (Qdrant/pgvector) | agent-core (SQLite brute-force exists) | Prototype |
| Hybrid reranking | mem0 | agent-core | Prototype |
| Fact extraction | mem0 (LLM) | agent-core (LLM) | Planned |
| Deduplication | mem0 (MD5 hash) | agent-core | Planned |
| Entity extraction | mem0 (NER) | agent-core | Planned |
| Consolidation | mem0 (LLM merge) | agent-core | Planned |
| Procedural memory | mem0 | agent-core | Planned |

## Replacement Rule

A native component CANNOT replace a mem0 component unless it demonstrates:

### Benchmark Gate

```text
Recall@1  ≥  mem0 baseline
Recall@3  ≥  mem0 baseline
Recall@5  ≥  mem0 baseline
MRR       ≥  mem0 baseline
nDCG@5    ≥  mem0 baseline
```

AND:

```text
Search latency p95  ≤  mem0 baseline × 1.2
Write latency p95   ≤  mem0 baseline × 1.2
```

### Process

1. Implement native component
2. Run `pnpm memory:eval` with both providers
3. Compare JSON reports
4. Native component must meet or exceed all benchmark gate criteria
5. Only then can it become the default

### Running Benchmarks

```bash
# Mock provider baseline
pnpm memory:eval > mock-baseline.json

# Mem0 provider baseline (requires running mem0 server)
MEMORY_PROVIDER=mem0 MEM0_BASE_URL=http://localhost:8000 pnpm memory:eval > mem0-baseline.json

# Compare
diff mock-baseline.json mem0-baseline.json
```

## Feature Flags for Hybrid Strategy

Individual memory subsystems can be configured independently:

```env
MEMORY_EXTRACTION_PROVIDER=mem0     # LLM fact extraction
MEMORY_RETRIEVAL_PROVIDER=mem0      # Hybrid search
MEMORY_DEDUP_PROVIDER=mem0          # Hash deduplication
```

This enables gradual migration:
1. Start with `MEMORY_PROVIDER=mem0` (all features via mem0)
2. Build native retrieval, benchmark it, swap `MEMORY_RETRIEVAL_PROVIDER=native`
3. Build native dedup, benchmark it, swap `MEMORY_DEDUP_PROVIDER=native`
4. Eventually `MEMORY_PROVIDER=native` when all subsystems are replaced

## Timeline

| Phase | Milestone | Criteria |
|-------|-----------|----------|
| **Now** | Mem0 as primary backend | Working adapter, benchmarks established |
| **Sprint 4** | Native retrieval parity | Recall metrics match mem0 |
| **Sprint 5** | Native extraction | LLM-based fact extraction in agent-core |
| **Sprint 6** | Native dedup | Hash + semantic dedup |
| **Future** | Full native stack | All subsystems pass benchmark gate |
