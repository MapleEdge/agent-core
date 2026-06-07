# Memory System

## Overview

agent-core's memory system is a pluggable provider architecture. Memory consumers interact with a single `MemoryProvider` interface regardless of which backend is active.

```text
API routes (memory/write, memory/search, ...)
  └─ getProvider("memory")
       ├─ MockMemoryProvider   — SQLite FTS, keyword matching
       └─ Mem0MemoryProvider   — mem0 via embedded worker or REST
```

## Why mem0 Cannot Run In-Process

mem0 is a Python-only library. Its core dependencies — qdrant-client (C via grpc), pydantic, openai, sqlalchemy, protobuf — are native Python packages with C extensions. They cannot:

- Be imported into a Node.js/TypeScript process
- Run in WebAssembly (Pyodide lacks C extension support)
- Be trivially ported to TypeScript (200K+ LoC across dependencies)

We evaluated three integration strategies:

| Strategy | Feasibility | Overhead | Operations |
|----------|-------------|----------|------------|
| **REST sidecar** | Works | Network I/O, port management, auth | Separate deployment |
| **Embedded Python worker** | Works | stdin/stdout IPC (~μs per call) | Zero — agent-core manages lifecycle |
| **In-process (WASM)** | Not feasible | N/A | N/A |

**Decision:** Embedded Python worker is the default. REST is retained as fallback for shared/multi-instance deployments.

## Transport Modes

### Embedded Worker (default)

Spawns `vendor/mem0/worker.py` as a child process. Communicates via JSON-RPC over stdin/stdout.

- No network, no ports, no auth configuration
- agent-core owns the Python process lifecycle (spawn, health check, graceful shutdown)
- Operationally indistinguishable from in-process
- Lazy-starts on first memory operation

```env
MEMORY_PROVIDER=mem0
MEM0_TRANSPORT=embedded            # default when MEMORY_PROVIDER=mem0
MEM0_PYTHON_PATH=python3           # optional, defaults to python3
```

### REST (fallback)

Calls an external mem0 HTTP server. Use when:

- A centralized mem0 server is shared across multiple agent-core instances
- Python is not available on the agent-core host
- You need a pre-existing mem0 server deployment

```env
MEMORY_PROVIDER=mem0
MEM0_TRANSPORT=rest
MEM0_BASE_URL=http://localhost:8000
MEM0_API_KEY=your-api-key          # optional
```

Backward compatible: setting `MEM0_BASE_URL` without `MEM0_TRANSPORT` implies REST mode.

## Provider Selection

Set via environment variable:

```env
MEMORY_PROVIDER=mock     # default — no external deps
MEMORY_PROVIDER=mem0     # embedded worker or REST (see Transport Modes)
```

### Mock Provider (default)

- SQLite-backed CRUD
- FTS5 full-text search
- Metadata filtering (eq, ne, in, nin, gt, gte, lt, lte, contains, icontains)
- AND/OR/NOT logical combinators
- No LLM calls, no external services

### Mem0 Provider

- LLM-driven fact extraction on write
- Hybrid BM25 + vector semantic search
- Entity extraction and entity boost scoring
- Hash-based memory deduplication
- Configurable reranking

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

## Transport Interface

```typescript
interface Mem0Transport {
  readonly mode: "embedded" | "rest";
  call<T>(request: Mem0Request): Promise<T>;
  ping(): Promise<boolean>;
  shutdown(): Promise<void>;
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

# Mem0 (requires Python + mem0 deps for embedded, or running server for REST)
MEMORY_PROVIDER=mem0 pnpm memory:eval > mem0.json

diff mock.json mem0.json
```

## Files

| File | Purpose |
|------|---------|
| `src/providers/MemoryProvider.ts` | Interface definition |
| `src/providers/mocks/MockMemoryProvider.ts` | SQLite-backed mock |
| `src/providers/adapters/Mem0MemoryProvider.ts` | mem0 adapter (transport-agnostic) |
| `src/memory/transports/Mem0Transport.ts` | Transport interface |
| `src/memory/transports/Mem0EmbeddedTransport.ts` | Embedded Python worker transport |
| `src/memory/transports/Mem0RestTransport.ts` | REST HTTP transport |
| `src/memory/mappers/mem0Mapper.ts` | Scope/metadata mapping |
| `vendor/mem0/worker.py` | Python worker script (JSON-RPC over stdio) |
| `src/memory/routes.ts` | HTTP endpoints |
| `scripts/memory-eval.ts` | Benchmark harness |
| `tests/fixtures/memory-retrieval-benchmarks.json` | Benchmark fixtures |
| `docs/memory-roadmap.md` | Replacement strategy |
| `docs/memory/upstream-tracking.md` | Upstream version tracking |

## See Also

- [Memory Roadmap](memory-roadmap.md) — replacement strategy and benchmark gate
- [Upstream Tracking](memory/upstream-tracking.md) — mem0 version management
- [Providers](providers.md) — architecture and provider registry
