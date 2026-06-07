# claude-mem Memory Enrichment and SQLite FTS

This integration upgrades agent-core's memory substrate with portable claude-mem-inspired fields and FTS-backed search while keeping the current SQLite-only, zero-sidecar constraint.

## Vendor source inspected

### mem0 metadata filter DSL

mem0's `Memory.search()` accepts `filters`, `threshold`, reranking, and explainability parameters (`vendor/providers/memory/mem0/mem0/memory/main.py:1127-1136`). The source documents exact metadata operators for equality, inequality, list membership, numeric comparisons, text containment, wildcard presence, and logical `AND`/`OR`/`NOT` groups (`main.py:1148-1163`). It copies and validates filters before search (`main.py:1182-1200`) and has a separate branch for advanced-operator processing (`main.py:1204-1209`).

**Adapted:** agent-core now accepts `filters` on `/memory/search` and evaluates mem0-style metadata operators after local FTS candidate retrieval. This keeps the API compatible with future mem0 sidecar semantics without introducing mem0's vector-store dependency chain.

### Rich memory item schema

claude-mem models durable memory with explicit kinds: `observation`, `summary`, `prompt`, and `manual` (`vendor/providers/knowledge/claude-mem/src/core/schemas/memory-item.ts:5-6`). Its `MemoryItemSchema` stores text/narrative plus extracted `facts`, `concepts`, `filesRead`, `filesModified`, metadata, and creation/update epochs (`memory-item.ts:8-26`). Its create schema makes the enrichment fields optional so callers can progressively add them (`memory-item.ts:28-44`).

**Adapted:** agent-core added `kind`, `facts`, `concepts`, `files_read`, and `files_modified` to memory write/get/search/update. Names remain snake_case to match agent-core's existing HTTP contract.

### SQLite search strategy

claude-mem's `SQLiteSearchStrategy` chooses SQLite search when no semantic query is available or SQLite is requested (`vendor/providers/knowledge/claude-mem/src/services/worker/search/strategies/SQLiteSearchStrategy.ts:21-23`). It separates observation, session, and prompt search targets (`SQLiteSearchStrategy.ts:38-45`), delegates to SQLite-backed search methods (`SQLiteSearchStrategy.ts:75-83`), and returns strategy metadata with `usedChroma: false` (`SQLiteSearchStrategy.ts:85-89`). It also exposes concept and file lookup helpers (`SQLiteSearchStrategy.ts:92-107`).

**Adapted:** agent-core keeps one `memories` table but indexes content, facts, concepts, and file arrays in an FTS5 virtual table. Search still returns provider-level records, so a later Chroma or mem0 sidecar can replace it without route changes.

### FTS query behavior

claude-mem's `SessionSearch.searchObservations()` uses FTS5 when available, joins the FTS table to the source table, applies filters, orders by relevance, and limits the result set (`vendor/providers/knowledge/claude-mem/src/services/sqlite/SessionSearch.ts:268-287`). Its session search follows the same pattern, using FTS relevance ordering unless date ordering is requested (`SessionSearch.ts:326-352`).

**Adapted:** agent-core's `MockMemoryProvider.search()` joins `memories_fts` to `memories`, applies `scope` and `scope_id` filters, orders by `bm25(memories_fts)`, and maps rank to a stable score.

## Why this architecture is superior for agent-core

| Alternative | Why not chosen | Why this is better now |
|---|---|---|
| Keep `content LIKE ?` only | Misses extracted facts/concepts/files and has no relevance ranking | FTS indexes content plus enrichment fields with `bm25` ranking |
| Copy full claude-mem `SessionStore` | Bun-specific SQLite and much larger observation/session schema | Portable subset works with `better-sqlite3` and current API |
| Adopt mem0 sidecar immediately | Requires Python runtime, embeddings, vector store, and graph dependencies | SQLite FTS is deterministic, fast, and CI-friendly |
| Ignore mem0 metadata filters | Would make a later sidecar adapter a breaking API change | Current provider supports the same deterministic filter DSL locally |
| Add Chroma now | Requires external sidecar and embedding model | FTS improves local search without adding services |
| Store only metadata JSON | Harder to query deterministically and rank | First-class columns are easy to index and return in API responses |

## Implementation notes

- `MemoryKind` enum mirrors claude-mem's durable memory kinds.
- Enrichment arrays are stored as JSON text in SQLite and parsed at provider boundaries.
- `memories_fts` indexes `content`, `facts`, `concepts`, and combined file references.
- Triggers keep FTS rows in sync for insert, update, and delete.
- Existing databases are migrated with `ALTER TABLE ... ADD COLUMN` checks.
- Search falls back to `LIKE` for queries that tokenize to an empty FTS expression.
- Metadata filters support `eq`, `ne`, `in`, `nin`, `gt`, `gte`, `lt`, `lte`, `contains`, `icontains`, wildcard `"*"`, and logical `AND`/`OR`/`NOT`.

## Tests

Contract/parity tests cover:

1. Writing and reading enriched memories with kind/facts/concepts/files.
2. Updating enriched fields through the provider and API patch endpoint.
3. Searching facts, concepts, and file references through FTS.
4. Preserving scoped search behavior with `scope` and `scope_id`.
5. Filtering search results with mem0-style metadata operators and logical groups.

These tests validate the deterministic parts of claude-mem's architecture: typed memory enrichment, metadata-preserving CRUD, and local SQLite search across enriched fields.

## Non-goals

- No Chroma semantic search.
- No mem0 LLM extraction pipeline.
- No graph memory.
- No claude-mem session/prompt table split.
- No import/source-lineage table yet.
