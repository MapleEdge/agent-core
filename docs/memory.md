# Memory Subsystem

## Architecture

```
MemoryProvider
 └─ SQLiteHybridMemoryProvider (default, status: direct)

EmbeddingProvider
 ├─ MockEmbeddingProvider       (default, status: mock)
 ├─ OpenAICompatibleEmbeddingProvider (DeepSeek/OpenAI/local, status: adapter)
 └─ LocalEmbeddingProvider      (stub, status: mock)

SQLiteEmbeddingStore
 └─ Compact Float32 BLOB storage + brute-force cosine similarity
```

## Hybrid Retrieval

Search combines BM25 keyword ranking with vector cosine similarity:

```
query
→ metadata filtering
→ BM25 retrieval (SQLite FTS5)
→ embedding generation
→ vector retrieval (cosine similarity)
→ hybrid rerank
→ return
```

Hybrid score formula:

```
score = vectorWeight × cosineSimilarity + bm25Weight × normalizedBm25
```

Default weights: `vectorWeight = 0.7`, `bm25Weight = 0.3`.

Configurable via environment:

```env
MEMORY_VECTOR_WEIGHT=0.7
MEMORY_BM25_WEIGHT=0.3
```

## Fallback Behavior

If embedding generation or vector search fails, search falls back to BM25-only.
The search endpoint never fails solely because embeddings are unavailable.

## Memory Write Path

```
persist memory to SQLite
→ generate embedding (async, non-blocking)
→ store embedding
```

Embedding failure does not block memory writes. Memory remains searchable via FTS.

## EmbeddingProvider

```typescript
interface EmbeddingProvider {
  readonly name: string;
  readonly status: ProviderStatus;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}
```

### MockEmbeddingProvider

Deterministic hash-based pseudo-embeddings. Same input → same vector.
No external APIs. Default for tests and development.

### OpenAICompatibleEmbeddingProvider

Works with any OpenAI-compatible `/v1/embeddings` endpoint:

```env
EMBEDDING_API_KEY=your-api-key
EMBEDDING_BASE_URL=https://api.deepseek.com/v1  # default
EMBEDDING_MODEL=text-embedding-3-small           # default
EMBEDDING_DIMENSIONS=1536                        # optional
```

Providers: DeepSeek, OpenAI, OpenRouter, vLLM, llama.cpp, etc.

### LocalEmbeddingProvider

Stub for future local embedding support (Ollama, sentence-transformers, ONNX Runtime).
Currently delegates to MockEmbeddingProvider.

## SQLiteEmbeddingStore

Stores vectors as compact Float32 BLOBs in SQLite.

```sql
CREATE TABLE memory_embeddings (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  vector BLOB NOT NULL,
  created_at TEXT NOT NULL
);
```

Search uses brute-force cosine similarity. Correct before fast.

### Storage Efficiency

Float32 encoding: 4 bytes per dimension.
128-dim vector: 512 bytes. 1536-dim vector: 6 KB.

## API Endpoints

### POST /memory/write

Creates a memory and generates an embedding.

### POST /memory/search

Hybrid search with BM25 + vector retrieval.

Parameters:
- `query` (string, required)
- `scope` (string, optional)
- `scope_id` (string, optional)
- `filters` (object, optional) — metadata filters
- `limit` (number, optional, default 10)

### GET /memory/:memory_id

Retrieve a single memory.

### PATCH /memory/:memory_id

Update a memory. Re-embeds on content change.

### DELETE /memory/:memory_id

Delete a memory and its embedding.

## Benchmarks

Run: `pnpm test:retrieval`

Metrics reported:
- Recall@1, Recall@3, Recall@5
- MRR (Mean Reciprocal Rank)
- nDCG@5

Performance measured at 100, 1000, 10000 memories:
- Embedding latency
- Vector search latency
- Hybrid search latency
- Memory write latency

## Design Decisions

1. **No VectorStore abstraction** — SQLite is the only persistence target.
   A future VectorStore interface can wrap SQLiteEmbeddingStore without refactoring.

2. **EmbeddingProvider is the abstraction** — embedding generation varies between
   deployments (mock, local, cloud API), so it gets the interface.

3. **Brute-force search** — correctness over optimization. Adequate for 10K+ memories.
   Future: approximate nearest neighbor index if needed.

4. **Float32 BLOB** — compact, fast decode, no JSON parsing overhead.
