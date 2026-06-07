# Providers

## Architecture

agent-core uses a provider registry pattern where each subsystem is abstracted behind an interface. Implementations can be swapped via environment variables and the registry.

```typescript
registerProvider("memory", new MockMemoryProvider());   // or
registerProvider("memory", new Mem0MemoryProvider(config));
```

## Provider Status Types

| Status | Meaning | Example |
|--------|---------|---------|
| `mock` | Simulated behavior (SQLite/in-memory) | MockMemoryProvider |
| `direct` | Deterministic port from vendor source | LettaRuleSolverProvider |
| `adapter` | Calls external API with fallback | Mem0MemoryProvider, GeminiClassifierProvider |
| `sidecar` | Calls vendor service as separate process | Planned |
| `reference` | Reference code only | ClaudeMemTimelineAdapter |

## Memory Providers

### MockMemoryProvider (`mock`)

- SQLite-backed CRUD with FTS5 full-text search
- No external dependencies
- Default for testing and development

### Mem0MemoryProvider (`adapter`)

- Calls mem0 REST API as sidecar
- LLM-driven fact extraction, hybrid search, dedup
- Requires `MEM0_BASE_URL` environment variable
- Falls back to mock when unavailable

**Configuration:**

```env
MEMORY_PROVIDER=mem0
MEM0_BASE_URL=http://localhost:8000
MEM0_API_KEY=your-api-key          # optional
MEM0_USER_ID=agent-core            # optional, default scope
```

## Why Mem0?

mem0 provides capabilities that are expensive to build natively:

1. **LLM-driven fact extraction** — converts conversations into searchable atomic facts
2. **Entity extraction + entity boost** — improves recall for "who/what" queries
3. **Hash-based deduplication** — prevents duplicate memories
4. **27+ vector store backends** — production-grade vector search
5. **Hybrid scoring** — BM25 + semantic + entity boost

## Why Keep MockMemoryProvider?

1. **Zero-dependency testing** — unit tests run without external services
2. **Benchmark baseline** — establishes the bar native implementations must beat
3. **Fallback** — graceful degradation when mem0 is unavailable
4. **Future native path** — existing SQLite code is the foundation for native replacements

## Provider Swapping

Switching providers requires only environment variable changes:

```bash
# Development (default)
pnpm dev

# With mem0
MEMORY_PROVIDER=mem0 MEM0_BASE_URL=http://localhost:8000 pnpm dev
```

The provider registry ensures all consumers use the registered implementation:

```typescript
const provider = getProvider("memory");  // returns whatever was registered
await provider.write({ ... });            // same API regardless of backend
```

## Benchmark-Driven Replacement

Native implementations cannot replace mem0 unless they pass the benchmark gate:

```text
Recall@1  ≥  mem0 baseline
Recall@3  ≥  mem0 baseline
Recall@5  ≥  mem0 baseline
MRR       ≥  mem0 baseline
nDCG@5    ≥  mem0 baseline
Latency   ≤  mem0 baseline × 1.2
```

See [docs/memory-roadmap.md](memory-roadmap.md) for the full replacement strategy.
