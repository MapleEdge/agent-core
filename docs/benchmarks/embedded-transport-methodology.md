# Embedded Transport Benchmark Methodology

## Production Path

All benchmark results are produced through agent-core's full production path:

```
benchmark runner (Python)
  → POST /memory/ingest + POST /memory/recall (HTTP)
    → agent-core Fastify server (TypeScript)
      → Mem0MemoryProvider
        → Mem0EmbeddedTransport (JSON-RPC over stdin/stdout)
          → worker.py (Python child process)
            → mem0.Memory (vendored, patched)
              → DeepSeek LLM (fact extraction)
              → Voyage embeddings (vectorization)
              → Qdrant embedded (vector storage)
```

No shortcuts, no fake REST bridges, no benchmark-only behavior.

## Components

### Agent-Core Server (`src/`)

Routes:
- `POST /memory/ingest` — Accepts multi-message conversations, passes through to `mem0.Memory.add()`
- `POST /memory/recall` — Accepts query + user_id, passes through to `mem0.Memory.search()`
- `DELETE /memory/users/:user_id` — Deletes all memories for a user

All responses include:
- `_latency_ms` — Total round-trip time from HTTP request to response
- `_transport` — Always `"embedded"` for production path

### Embedded Transport (`src/providers/adapters/Mem0EmbeddedTransport.ts`)

Spawns `vendor/mem0/worker.py` as a child process. Communication via JSON-RPC over stdin/stdout. No network, no ports.

### Worker (`vendor/mem0/worker.py`)

- Prepends `vendor/providers/memory/mem0/` to `sys.path` to use vendored mem0
- Logs proof of vendored source on startup
- Handles provider-specific config (DeepSeek `deepseek_base_url`, Voyage dimensions)
- Maps benchmark params to mem0 API (`timestamp` → metadata, `custom_instructions` → `prompt`)

### Vendored mem0 (`vendor/providers/memory/mem0/`)

Patched `mem0/embeddings/openai.py`:
- Detects non-OpenAI providers via `_is_openai_native` flag
- Skips `encoding_format` and `dimensions` params for Voyage API compatibility
- Correctly handles `embedding_dims` for non-1536 models

### Benchmark Adapter (`vendor/memory-benchmarks/benchmarks/common/agent_core_client.py`)

Drop-in replacement for `Mem0Client`. Translates benchmark operations to agent-core HTTP API calls. **API-shape translation only** — no benchmark-specific memory behavior.

## Required Environment Variables

```bash
# Agent-core server
MEMORY_PROVIDER=mem0
MEM0_TRANSPORT=embedded

# LLM (fact extraction)
MEM0_LLM_PROVIDER=deepseek
MEM0_LLM_API_KEY=$DEEPSEEK_API_KEY
MEM0_LLM_BASE_URL=https://api.deepseek.com/v1
MEM0_LLM_MODEL=deepseek-chat

# Embeddings
MEM0_EMBEDDER_PROVIDER=openai          # OpenAI-compatible API
MEM0_EMBEDDER_MODEL=voyage-code-3
MEM0_EMBEDDER_API_KEY=$VOYAGE_API_KEY
MEM0_EMBEDDER_BASE_URL=https://api.voyageai.com/v1
MEM0_EMBEDDER_DIMS=1024

# Passed through to embedded worker
DEEPSEEK_API_KEY=$DEEPSEEK_API_KEY
VOYAGE_API_KEY=$VOYAGE_API_KEY

# Benchmark answerer/judge (DeepSeek via OpenAI-compatible SDK)
OPENAI_API_KEY=$DEEPSEEK_API_KEY
OPENAI_BASE_URL=https://api.deepseek.com/v1
```

## Running Benchmarks

### Start Agent-Core

```bash
cd /path/to/agent-core
npm run build
MEMORY_PROVIDER=mem0 MEM0_TRANSPORT=embedded \
MEM0_LLM_PROVIDER=deepseek MEM0_LLM_API_KEY=$DEEPSEEK_API_KEY \
MEM0_LLM_BASE_URL=https://api.deepseek.com/v1 MEM0_LLM_MODEL=deepseek-chat \
MEM0_EMBEDDER_PROVIDER=openai MEM0_EMBEDDER_MODEL=voyage-code-3 \
MEM0_EMBEDDER_API_KEY=$VOYAGE_API_KEY \
MEM0_EMBEDDER_BASE_URL=https://api.voyageai.com/v1 MEM0_EMBEDDER_DIMS=1024 \
DEEPSEEK_API_KEY=$DEEPSEEK_API_KEY VOYAGE_API_KEY=$VOYAGE_API_KEY \
node dist/index.js
```

### Run LOCOMO

```bash
cd vendor/memory-benchmarks
OPENAI_API_KEY=$DEEPSEEK_API_KEY OPENAI_BASE_URL=https://api.deepseek.com/v1 \
python -m benchmarks.locomo.run \
  --project-name my-run \
  --backend agent-core \
  --mem0-host http://localhost:3210 \
  --answerer-model deepseek-chat \
  --judge-model deepseek-chat \
  --provider openai \
  --output-dir ./results/locomo
```

### Run LongMemEval

```bash
cd vendor/memory-benchmarks
OPENAI_API_KEY=$DEEPSEEK_API_KEY OPENAI_BASE_URL=https://api.deepseek.com/v1 \
python -m benchmarks.longmemeval.run \
  --project-name my-run \
  --backend agent-core \
  --mem0-host http://localhost:3210 \
  --answerer-model deepseek-chat \
  --judge-model deepseek-chat \
  --provider openai \
  --output-dir ./results/longmemeval
```

### Run BEAM

```bash
cd vendor/memory-benchmarks
OPENAI_API_KEY=$DEEPSEEK_API_KEY OPENAI_BASE_URL=https://api.deepseek.com/v1 \
python -m benchmarks.beam.run \
  --project-name my-run \
  --backend agent-core \
  --mem0-host http://localhost:3210 \
  --answerer-model deepseek-chat \
  --judge-model deepseek-chat \
  --provider openai \
  --output-dir ./results/beam
```

## Path Distinction

| Path | What It Tests | Production? |
|------|--------------|-------------|
| **Embedded transport** (this doc) | Full agent-core → Mem0MemoryProvider → EmbeddedTransport → worker.py → mem0.Memory | Yes |
| REST fallback (`MEM0_TRANSPORT=rest`) | agent-core → Mem0MemoryProvider → RestTransport → external mem0 server | Yes (alternative deployment) |
| Direct mem0 Docker (mem0ai/memory-benchmarks) | benchmark → Docker mem0 server → mem0.Memory | No (reference baseline only) |

## Vendored Patch Verification

Worker logs confirm vendored mem0 is used:

```
[mem0-worker] INFO Using vendored mem0 from /path/to/vendor/providers/memory/mem0
[mem0-worker] INFO mem0 embeddings source: /path/to/vendor/providers/memory/mem0/mem0/embeddings/openai.py (vendored=True)
```

The vendored patch lives at `vendor/providers/memory/mem0/mem0/embeddings/openai.py`. The site-packages version is unpatched. Worker.py prepends the vendored path to `sys.path` to ensure the patched version is loaded.
