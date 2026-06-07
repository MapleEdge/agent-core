# Memory Capability Audit

> **Status**: Complete — awaiting review before implementation begins.
>
> **Purpose**: Determine for each of the 8 proposed memory capabilities whether
> agent-core should (1) delegate to mem0, (2) adapt a reference pattern,
> (3) compose as a thin orchestration layer, or (4) build natively.

---

## Audit Scope

### Capabilities evaluated

| # | Capability | Definition |
|---|-----------|------------|
| 1 | Session decomposition | Break a multi-turn session into discrete memory-worthy events |
| 2 | Answer generation over retrieved memories | Produce a natural-language answer grounded in retrieved memory results |
| 3 | Temporal search | Filter and rank memories by time range or recency |
| 4 | Multi-hop retrieval | Traverse relationships across multiple memory nodes to satisfy a query |
| 5 | Knowledge update tracking | Detect when a stored fact has been superseded and record the change |
| 6 | Abstention | Refuse to answer when retrieved evidence is insufficient or contradictory |
| 7 | Contradiction detection | Identify conflicting facts across memories |
| 8 | Event ordering | Reconstruct chronological sequence of events from unordered memories |

### Reference systems audited

| System | Location | Language | Primary role |
|--------|----------|----------|-------------|
| **mem0** | `vendor/providers/memory/mem0/` | Python | Memory extraction, dedup, hybrid retrieval |
| **claude-mem** | `vendor/providers/knowledge/claude-mem/` | TypeScript | Session/event persistence, observations, context injection |
| **OpenViking** | `vendor/providers/context/openviking/` | Python/Rust | Hierarchical retrieval, memory extraction, session compression |
| **Letta** | `vendor/providers/memory/letta/` | Python | Conversation search, archival memory, core memory management |
| **cognee** | `vendor/providers/knowledge/cognee/` | Python | Knowledge graph construction, temporal retrieval, graph-based search |
| **Parlant** | `vendor/providers/policy/parlant/` | Python | Guideline matching, coherence checking, policy enforcement |

---

## Capability Matrix

| Capability | mem0 | claude-mem | OpenViking | Letta | cognee | Parlant | Reuse strategy | agent-core responsibility | Implement now? |
|-----------|------|-----------|------------|-------|--------|---------|---------------|--------------------------|----------------|
| **Session decomposition** | Partial — `add()` accepts conversation messages and uses LLM to extract atomic facts (`_add_to_vector_store` 7-phase pipeline). Does not model session boundaries. | **Yes** — `ServerSession` tracks active/completed/failed sessions; `summarize.ts` extracts last assistant message and triggers LLM summarization; `observation.ts` captures tool-use events per session. | **Yes** — `CompressorV2` decomposes sessions via `ExtractLoop` (ReAct orchestrator) into typed memory files with merge operations. | Partial — `summarize_conversation_history()` compresses conversation into core memory blocks. No discrete event decomposition. | Partial — `cognify()` pipeline extracts entities/relationships from documents but is not session-aware. | No — operates on guidelines, not session data. | **Adapt claude-mem + OpenViking** — claude-mem's session lifecycle + observation hooks provide the event capture pattern; OpenViking's `ExtractLoop` provides the memory-update orchestration pattern. | Thin orchestration: map agent-core session events to the capture patterns. Own session boundary semantics and event taxonomy. | No — adapter only |
| **Answer generation** | No — `search()` returns ranked memory objects, not generated answers. | No — `context.ts` injects memories into model context but does not generate answers. | Partial — `IntentAnalyzer` generates query plans from session context; retriever returns structured context, not final answers. | No — `conversation_search()` and `archival_memory_search()` return raw results. | **Yes** — `GraphCompletionRetriever` and `GraphCompletionCotRetriever` generate LLM completions grounded in graph-retrieved context. `GRAPH_COMPLETION`, `RAG_COMPLETION`, `GRAPH_COMPLETION_COT` search types. | No — generates agent responses using guideline-matched policies, not memory retrieval answers. | **Adapt cognee** — cognee's `GraphCompletionRetriever` pattern (retrieve context → format prompt → LLM completion) is the canonical approach. | Own the answer assembly pipeline: retrieve via mem0 → format context → generate answer via LLM provider. Own prompt templates, confidence scoring, citation format. | No — composition layer |
| **Temporal search** | Partial — `search()` accepts metadata filters including timestamps, but no dedicated temporal query syntax. History via `history(memory_id)` returns change log with `created_at`/`updated_at`. | Partial — `memory_items` table has `created_at_epoch`/`updated_at_epoch`; FTS search is ordered by `updated_at_epoch DESC`. No temporal range query API. | **Yes** — `memory_lifecycle.py` implements `hotness_score()` combining access frequency + exponential time decay (configurable half-life). Blended with semantic scores in `HierarchicalRetriever`. | **Yes** — `conversation_search()` supports `start_date`/`end_date` ISO 8601 filters. `archival_memory_search()` supports `start_datetime`/`end_datetime`. | **Yes** — `TemporalRetriever` uses LLM to extract time intervals from queries (`extract_time_from_query`), then queries graph engine `collect_time_ids(time_from, time_to)`. Dedicated `TEMPORAL` search type. | No — guidelines are condition/action pairs without temporal semantics. | **Delegate to mem0 metadata filters + adapt cognee** — mem0's metadata filter operators (`gt`/`lt`/`gte`/`lte`) already support timestamp ranges. cognee's `TemporalRetriever` pattern (LLM extracts time → graph query) is the reference for natural-language temporal queries. OpenViking's hotness scoring is the reference for recency boosting. | Own temporal query parsing (LLM-based time extraction) and recency boost configuration. Delegate raw time-range filtering to mem0 metadata. | No — thin adapter over mem0 metadata + optional LLM time extraction |
| **Multi-hop retrieval** | No — single-stage retrieve + rerank. Graph memory (Neo4j/Memgraph) supports relationship traversal but is optional external infra. | No — single-stage FTS search. | **Yes** — `HierarchicalRetriever` implements recursive directory-based search with convergence detection (`MAX_CONVERGENCE_ROUNDS=3`), score propagation (`score_propagation_alpha`), global vector search → starting point merge → recursive child search → rerank. `RelatedContext` links parent/child/sibling resources. | No — `archival_memory_search()` is single-stage semantic search. | **Yes** — `GraphCompletionCotRetriever` implements chain-of-thought multi-hop: initial retrieval → validation → follow-up questions → additional retrieval. `GRAPH_COMPLETION_CONTEXT_EXTENSION` extends context through graph traversal. Triplet-based retrieval (`TripletSearchContextProvider`) traverses subject-predicate-object relationships. | No — guideline matching is single-stage condition evaluation. | **Adapt OpenViking + cognee** — OpenViking's hierarchical recursive search pattern is the reference for structured multi-hop. cognee's CoT retriever is the reference for LLM-guided multi-hop. | Own the orchestration loop: decide when to recurse, how many hops, convergence criteria. Delegate vector search to mem0, graph traversal to future graph provider. | No — orchestration layer, deferred until graph provider exists |
| **Knowledge update tracking** | **Yes** — `history(memory_id)` returns full change log via `SQLiteManager.get_history()`. On `add()`, the 7-phase pipeline compares new facts against existing via MD5 hash dedup, and LLM-decides `ADD`/`UPDATE`/`DELETE`/`NONE` for each. Updates preserve previous version in history table. | Partial — `memory_items` table tracks `updated_at_epoch` and supports update operations. `MemorySource` tracks provenance. No explicit change detection. | **Yes** — `MemoryUpdater` applies `ResolvedOperations` (create/update/delete) with merge operations (`MergeOp`). `StoredLink` tracks relationships between memory files. Full transaction-based update with `MemoryIsolationHandler`. | Partial — `rethink_memory()` rewrites memory blocks but does not track diffs. No history or versioning. | Partial — `cognify()` rebuilds knowledge graph from data. `memify()` enriches. No incremental update tracking. | No — guidelines are static condition/action pairs. | **Delegate to mem0** — mem0's `history()` + LLM-driven `ADD`/`UPDATE`/`DELETE`/`NONE` classification is the most complete implementation. | Thin adapter: expose mem0 history through agent-core's MemoryProvider contract. Own the semantics of what constitutes a "knowledge update" in platform context (e.g., when a user corrects a preference). | No — delegate to mem0 |
| **Abstention** | No — always returns results if any match threshold. No confidence gating. | No — injects all matched context without confidence assessment. | No — returns results above score threshold but does not model abstention. | No — returns search results without abstention logic. | No — retrievers return results or empty sets. No explicit "refuse to answer" capability. | **Partial** — `message_generator.py` skips response when "interaction is empty and there are no guidelines" or "no response deemed necessary". Guideline applicability checks (`guideline_actionable_batch`, `guideline_low_criticality_batch`) determine when guidelines should NOT apply. Conflict-aware prompt building: "If the instruction conflicts with an insight…prioritize the business's values." | **Agent-core native + adapt Parlant** — no reference system implements full retrieval-confidence-based abstention. Parlant's "skip response" and guideline applicability patterns provide the closest reference for policy-based response gating. | Own entirely: define abstention policy (min confidence threshold, min evidence count, contradiction detection trigger). This is a platform-level policy decision. | Yes — native, thin policy layer |
| **Contradiction detection** | No — dedup is hash-based (MD5 content comparison). No semantic conflict detection between memories. | No — no conflict detection. | No — `MergeOp` handles structural merge conflicts in memory files but not semantic contradictions. | No — `rethink_memory()` rewrites blocks holistically but does not detect contradictions. | No — knowledge graph construction does not include explicit contradiction detection. | **Yes** — `_CoherenceCheckDocument` in `evaluations.py` models guideline contradictions: `{kind, first, second, issue, severity}`. Coherence checks evaluate pairs of guidelines for conflicts. `behavioral_change_evaluation.py` orchestrates the full evaluation pipeline including coherence checks. | **Adapt Parlant** — Parlant's `CoherenceCheckDocument` structure (pair comparison with issue + severity) is the canonical pattern. | Own the detection logic: define what constitutes a memory contradiction (semantic conflict, temporal supersession, source disagreement). Adapt Parlant's pairwise comparison structure. Integrate with knowledge update tracking (mem0 history) to detect contradictions during updates. | Yes — native, adapting Parlant's structure |
| **Event ordering** | Partial — `history()` returns events with `created_at` timestamps, enabling chronological reconstruction for a single memory. No cross-memory event ordering. | Partial — `created_at_epoch` on all memory items enables time-based ordering. Session-scoped via `server_session_id`. | **Yes** — `memory_lifecycle.py` `hotness_score()` uses `updated_at` for recency. `HierarchicalRetriever` returns results with temporal metadata. `CompressorV2` processes session messages in order. | **Yes** — `conversation_search()` supports `start_date`/`end_date` filtering and returns results with timestamps + role metadata. Messages inherently ordered by conversation sequence. | **Yes** — `TemporalRetriever` queries `collect_time_ids(time_from, time_to)` for time-range graph traversal. Temporal edges in knowledge graph encode event sequences. | No — guidelines are stateless condition/action pairs. | **Compose from mem0 + claude-mem** — mem0's `history()` timestamps + claude-mem's `created_at_epoch` session ordering provide the raw temporal data. cognee's temporal graph edges provide the relationship-based ordering reference. | Own the composition: aggregate timestamps from mem0 history + session events → sort → deduplicate → present timeline. This is orchestration over existing temporal data, not new logic. | No — composition layer |

---

## Detailed Findings by Reference System

### mem0

**Source**: `vendor/providers/memory/mem0/mem0/memory/main.py` (3279 lines)

**Capabilities present**:
- **Memory extraction**: `_add_to_vector_store()` — 7-phase pipeline: LLM extracts atomic facts from conversation, entity linking, batch embedding, hash dedup, history persistence (lines 663–900)
- **Memory deduplication**: MD5 hash comparison on write; LLM classifies each new fact as `ADD`/`UPDATE`/`DELETE`/`NONE` relative to existing memories
- **Hybrid retrieval**: `scoring.py` — `score_and_rank()` combines semantic (80% default), BM25 (20%), and entity boost signals with adaptive sigmoid normalization
- **Knowledge update tracking**: `history(memory_id)` — full change log via `SQLiteManager.get_history()`
- **Metadata filtering**: Rich operator set (`eq`/`ne`/`in`/`nin`/`gt`/`lt`/`gte`/`lte`/`contains`/`icontains`/`AND`/`OR`/`NOT`)

**Capabilities absent**: Answer generation, temporal query parsing, multi-hop retrieval, abstention, contradiction detection, session decomposition.

### claude-mem

**Source**: `vendor/providers/knowledge/claude-mem/src/`

**Capabilities present**:
- **Session lifecycle**: `ServerSession` (active/completed/failed), session-scoped memory items
- **Observation capture**: `observation.ts` — automatic tool-usage capture (tool_name, tool_input, tool_response) via PostToolUse hook
- **Session summarization**: `summarize.ts` — LLM-based session summary generation on session close
- **Context injection**: `context.ts` — retrieves and injects relevant memories into model context via `/api/context/inject`
- **Structured memory**: `MemoryItem` with kind (observation/summary/prompt/manual), facts, concepts, files_read, files_modified
- **FTS search**: `buildFtsQuery()` — token-based FTS5 search ordered by recency

**Capabilities absent**: Semantic search, multi-hop, answer generation, temporal range queries, abstention, contradiction detection.

### OpenViking

**Source**: `vendor/providers/context/openviking/openviking/`

**Capabilities present**:
- **Hierarchical retrieval**: `HierarchicalRetriever` — recursive directory-based search with global vector search, starting-point merge, convergence detection (max 3 rounds), score propagation
- **Intent analysis**: `IntentAnalyzer` — LLM generates multi-query plans (typed queries for memory/resources/skill) from session context
- **Memory extraction**: `ExtractLoop` — ReAct orchestrator for memory updates. LLM decides tool calls or final operations. Supports create/update/delete with merge operations
- **Memory lifecycle**: `hotness_score()` — frequency × recency decay (configurable half-life) for result boosting
- **Session compression**: `CompressorV2` — orchestrates `ExtractLoop` + `MemoryUpdater` + `SkillOperationUpdater` with transactional memory isolation
- **Rerank**: `RerankClient.from_config()` — pluggable reranker with threshold-based filtering

**Capabilities absent**: Answer generation (returns context, not answers), abstention, contradiction detection.

### Letta

**Source**: `vendor/providers/memory/letta/letta/`

**Capabilities present**:
- **Conversation search**: `conversation_search()` — hybrid text + semantic similarity over conversation history with role filtering and date range support
- **Archival memory**: `archival_memory_insert/search()` — permanent semantic memory with tag-based filtering and date ranges
- **Core memory management**: `memory()` function — structured file-like memory with create/str_replace/insert/delete/rename operations
- **Memory rewriting**: `rethink_memory()` — holistic memory block rewrite integrating new information
- **Session summarization**: `summarize_conversation_history()` — compresses conversation into core memory

**Capabilities absent**: Multi-hop retrieval, answer generation, abstention, contradiction detection, knowledge update history.

### cognee

**Source**: `vendor/providers/knowledge/cognee/cognee/`

**Capabilities present**:
- **Temporal retrieval**: `TemporalRetriever` — LLM extracts time intervals from natural-language queries, graph engine retrieves time-scoped nodes
- **Graph completion**: `GraphCompletionRetriever` — vector search → graph context → LLM completion
- **Chain-of-thought retrieval**: `GraphCompletionCotRetriever` — multi-round retrieval with validation and follow-up questions
- **Context extension**: `GraphCompletionContextExtensionRetriever` — extended graph traversal for broader context
- **Triplet search**: `TripletSearchContextProvider` — subject-predicate-object relationship traversal
- **Multiple search types**: 16 search types including `TEMPORAL`, `GRAPH_COMPLETION_COT`, `NATURAL_LANGUAGE`, `AGENTIC_COMPLETION`, `FEELING_LUCKY`
- **Knowledge graph construction**: `cognify()` pipeline — entity extraction, relationship building, vector + graph storage

**Capabilities absent**: Session decomposition, abstention, explicit contradiction detection, knowledge update tracking/history.

### Parlant

**Source**: `vendor/providers/policy/parlant/src/parlant/core/`

**Capabilities present**:
- **Guideline matching**: `GuidelineMatcher` — LLM-based batch evaluation of condition/action guidelines against session context, with retry policies and strategy resolution
- **Coherence checking**: `_CoherenceCheckDocument` — pairwise guideline conflict detection with `{kind, first, second, issue, severity}` structure
- **Response gating**: `message_generator.py` — skips response when no guidelines apply or no response deemed necessary
- **Guideline applicability**: `guideline_actionable_batch`, `guideline_low_criticality_batch` — determines when guidelines should NOT apply based on conversation context
- **Conflict handling**: Prompt-level conflict resolution between guidelines and insights, prioritizing business values

**Capabilities absent**: Memory search, temporal retrieval, session decomposition, answer generation over memories.

---

## Decision Summary

### Delegate to mem0 (already implemented)

| Capability | Justification |
|-----------|--------------|
| Memory extraction | mem0's 7-phase pipeline is the most complete |
| Memory dedup | MD5 hash + LLM classification in mem0 |
| Hybrid retrieval | mem0's BM25 + semantic + entity boost scoring |
| Knowledge update tracking | mem0's `history()` with full change log |

### Adapt from reference (thin adapter or composition layer)

| Capability | Best reference | What to adapt | What agent-core owns |
|-----------|---------------|---------------|---------------------|
| Session decomposition | claude-mem + OpenViking | claude-mem's session lifecycle + observation hooks; OpenViking's `ExtractLoop` orchestration | Session boundary semantics, event taxonomy, mapping to mem0 `add()` |
| Answer generation | cognee | `GraphCompletionRetriever` pattern: retrieve → format → complete | Prompt templates, confidence scoring, citation format |
| Temporal search | cognee + mem0 metadata | cognee's LLM-based time extraction; mem0's metadata filter operators | Temporal query interface, recency boost configuration |
| Multi-hop retrieval | OpenViking + cognee | OpenViking's hierarchical recursive search; cognee's CoT multi-round retrieval | Orchestration loop, convergence criteria, hop limits |
| Event ordering | mem0 + claude-mem | mem0's `history()` timestamps; claude-mem's `created_at_epoch` ordering | Timeline composition, cross-source aggregation |

### Build natively (no adequate reference exists)

| Capability | Closest reference | Why native | Scope |
|-----------|------------------|-----------|-------|
| Abstention | Parlant (response gating) | No reference system implements retrieval-confidence-based abstention. Parlant's guideline applicability is the closest pattern but operates on policies, not memory retrieval confidence. | Thin policy layer: min confidence threshold, min evidence count, contradiction trigger |
| Contradiction detection | Parlant (coherence checks) | No reference system detects semantic contradictions between memories. Parlant's `CoherenceCheckDocument` provides the structural pattern but operates on guideline pairs, not memory pairs. | Pairwise comparison adapted from Parlant's `{kind, first, second, issue, severity}` structure |

---

## What Code Should Be Avoided

The following should **not** be built in agent-core:

| Component | Why not | Delegate to |
|-----------|---------|------------|
| Memory extraction LLM pipeline | mem0's 7-phase pipeline is production-tested | mem0 `add()` |
| Hash-based memory deduplication | Already in mem0 | mem0 `_add_to_vector_store()` |
| BM25 scoring / normalization | Already in mem0 `scoring.py` | mem0 `search()` |
| Entity extraction + entity boost | Already in mem0 | mem0 `search()` |
| Reranker integration | Already in mem0 + OpenViking | mem0 `RerankerFactory` |
| Vector store backends | Already in mem0 (27 backends) | mem0 vector providers |
| Knowledge graph construction | Already in cognee `cognify()` | cognee (future provider) |
| Session lifecycle management | Already in claude-mem | claude-mem `ServerSession` |
| Observation capture hooks | Already in claude-mem | claude-mem `observation.ts` |
| Guideline matching engine | Already in Parlant | Parlant (future provider) |
| Hierarchical recursive search | Already in OpenViking | OpenViking (future provider) |

---

## Implementation Priorities

Based on the audit, the recommended implementation order:

### Phase 1 — Adapters and thin layers (allowed now)

1. **Knowledge update tracking adapter** — expose mem0 `history()` through MemoryProvider
2. **Temporal search adapter** — map temporal query syntax to mem0 metadata filters
3. **Session decomposition adapter** — map agent-core session events to mem0 `add()` calls

### Phase 2 — Composition layers (after Phase 1 benchmarks)

4. **Answer generation** — retrieve via mem0 → format context → LLM completion
5. **Event ordering** — aggregate timestamps from mem0 + session events → timeline

### Phase 3 — Native implementations (only these two)

6. **Abstention gate** — policy layer with configurable confidence threshold
7. **Contradiction detection** — pairwise comparison adapted from Parlant's coherence check structure

### Phase 4 — Orchestration (requires graph provider)

8. **Multi-hop retrieval** — orchestration loop over mem0 search + future graph traversal

---

## Follow-up TODOs

- [ ] Implement knowledge update tracking adapter (expose mem0 `history()`)
- [ ] Implement temporal search adapter (mem0 metadata filters + LLM time extraction)
- [ ] Implement session decomposition adapter (session events → mem0 `add()`)
- [ ] Implement answer generation composition layer
- [ ] Implement event ordering composition layer
- [ ] Implement abstention gate (native policy layer)
- [ ] Implement contradiction detection (native, Parlant-adapted structure)
- [ ] Implement multi-hop retrieval orchestration (deferred until graph provider)
