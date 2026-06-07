# Mem0 Upstream Tracking

## Current State

| Field | Value |
|-------|-------|
| Upstream repo | https://github.com/mem0ai/mem0 |
| Vendored path | `vendor/providers/memory/mem0/` |
| Version info | `vendor/mem0/VERSION` |
| License | Apache-2.0 |
| Integration type | `adapter` — calls mem0 REST API as sidecar |

## Version Tracking

The vendored mem0 source lives at `vendor/providers/memory/mem0/` and serves as reference code for understanding mem0's behavior. The actual integration uses mem0's REST API via `Mem0MemoryProvider`.

### Current Upstream Commit

See `vendor/mem0/VERSION` for the pinned commit and tag.

### Local Modifications

None. The vendored source is reference-only — agent-core calls mem0 through its HTTP API, not by importing Python code.

## Upgrade Procedure

### 1. Fetch latest upstream

```bash
bash scripts/update-mem0.sh
```

This will:
- Clone/fetch the latest mem0 source
- Show a diff summary against the current vendored version
- Update `vendor/mem0/VERSION` with the candidate commit

### 2. Review changes

```bash
# What changed in mem0's memory module?
diff -r vendor/providers/memory/mem0/mem0/memory/ /tmp/mem0-upstream/mem0/memory/

# What changed in the REST API?
diff vendor/providers/memory/mem0/server/main.py /tmp/mem0-upstream/server/main.py
```

### 3. Run benchmarks

```bash
# Baseline: current version
pnpm memory:eval > baseline.json

# Candidate: start mem0 with new version, then:
MEMORY_PROVIDER=mem0 MEM0_BASE_URL=http://localhost:8000 pnpm memory:eval > candidate.json

# Compare
diff baseline.json candidate.json
```

### 4. Validate

Before promoting the candidate:

```text
Recall@1 >= baseline
Recall@3 >= baseline
Recall@5 >= baseline
MRR >= baseline
nDCG@5 >= baseline
Search latency p95 <= baseline * 1.2
Write latency p95 <= baseline * 1.2
```

### 5. Apply

If benchmarks pass:

```bash
# Copy new version into vendor/
cp -r /tmp/mem0-upstream/* vendor/providers/memory/mem0/

# Update version tracking
# Edit vendor/mem0/VERSION with new commit/tag

# Run full test suite
pnpm test
bash scripts/smoke_test.sh
```

## Upgrade Report Format

When comparing versions, the report should include:

```json
{
  "current_version": "commit-abc123",
  "candidate_version": "commit-def456",
  "benchmark_deltas": {
    "recallAt1": "+0.02",
    "mrr": "+0.01",
    "searchP95": "-1.2ms"
  },
  "breaking_changes": [],
  "recommended_action": "upgrade"
}
```

## What We Use From Mem0

| Capability | Used via | Notes |
|-----------|----------|-------|
| Memory add (with LLM extraction) | `POST /memories` | Fact extraction, dedup |
| Memory search (hybrid) | `POST /search` | Semantic + BM25 + entity boost |
| Memory CRUD | `GET/PUT/DELETE /memories/:id` | Standard operations |
| Entity extraction | Implicit in search | Entity boost scoring |
| Reranking | Implicit in search | When configured server-side |

## What We Do NOT Use From Mem0

| Capability | Reason |
|-----------|--------|
| Graph memory (Neo4j) | Not needed for current use cases |
| Platform client (hosted API) | We run self-hosted |
| MCP server | Agent-core has its own MCP integration |
| Telemetry | Disabled for privacy |
| Auth layer | Agent-core handles its own auth |
