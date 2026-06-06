# Provider Integration Audit

Audit of all 9 vendored providers for direct, adapter, sidecar, or reference-only integration into agent-core.

---

## 1. mem0 (mem0ai/mem0)

**Category:** Memory  
**Language:** Python (core SDK)  
**License:** Apache-2.0  

### Files inspected

- `mem0/memory/main.py` — `Memory` class (3279 lines): `add()`, `search()`, `get()`, `get_all()`, `update()`, `delete()`, `history()`
- `_add_to_vector_store`, `_search_vector_store`, `_create_procedural_memory`
- `_build_filters_and_metadata`, `_validate_and_trim_entity_id`
- Entity upsert/cleanup helpers

### Key functions/classes worth using

| Symbol | Purpose | Portable? |
|--------|---------|-----------|
| `Memory.add()` | 8-phase pipeline: validate → LLM extract facts → embed → dedup → vector upsert → graph update → entity link → save messages | No — deeply coupled to LLM + vector store + graph |
| `Memory.search()` | Embed query → vector search → optional rerank → score threshold → format | No — requires vector store + embedder |
| `_build_filters_and_metadata()` | Session-scoped filter construction from `user_id/agent_id/run_id` | **Yes** — pure logic, portable |
| `MemoryItem` schema | Pydantic model for memory records | **Yes** — schema only |
| Filter operators (`eq/ne/in/gt/contains/AND/OR`) | Rich metadata filter DSL | **Reference** — good design to copy |

### Direct integration feasibility

**Not feasible.** mem0 requires Python runtime + LLM provider + vector store + optional graph store. The `Memory` class instantiates `EmbedderFactory`, `VectorStoreFactory`, `LlmFactory` — all Python-only with heavy dependency graphs (OpenAI, Qdrant, Neo4j, etc.).

### Adapter/sidecar feasibility

**Feasible via Python sidecar.** Run mem0 as a separate FastAPI service, agent-core calls it over HTTP. This is the recommended path for production.

### Recommended integration strategy

**Sidecar planned.** For Phase 1, use mock MemoryProvider. For Phase 2, spin up mem0 as an HTTP sidecar and call its API from a `Mem0MemoryAdapter`.

### What NOT to copy

- The entire LLM extraction pipeline (750+ lines in `add()`)
- Vector store abstraction layer (use mem0's own)
- Telemetry/capture_event infrastructure
- Entity store management

### Dependency risk

High — transitive deps include openai, qdrant-client, neo4j, chromadb, and many LLM providers.

---

## 2. claude-mem (thedotmack/claude-mem)

**Category:** Knowledge / Session persistence  
**Language:** TypeScript (Bun-native, some Bun-specific APIs)  
**License:** MIT  

### Files inspected

- `src/services/sqlite/SessionStore.ts` — 2671 lines: schema init, migrations (32 schema versions), session CRUD, observation CRUD, prompt tracking
- `src/services/worker/SearchManager.ts` — 1670 lines: search orchestration, Chroma semantic search, FTS fallback, timeline construction
- `src/services/worker/TimelineService.ts` — 226 lines: timeline building, depth filtering, formatting
- `src/services/sync/ChromaSync.ts` (referenced)

### Key functions/classes worth using

| Symbol | Purpose | Portable? |
|--------|---------|-----------|
| `SessionStore` | SQLite session/observation/prompt CRUD with WAL mode | **Partially** — uses `bun:sqlite`, needs adaptation to `better-sqlite3` |
| `TimelineService.buildTimeline()` | Merge observations+sessions+prompts into sorted timeline | **Yes** — pure logic |
| `TimelineService.filterByDepth()` | Windowed timeline around an anchor item | **Yes** — pure logic |
| `SearchManager.searchChromaForTimeline()` | Semantic search with date filtering | **Reference** — Chroma-specific |
| Schema migration pattern | Versioned `schema_versions` table with incremental ALTER TABLE | **Reference** — good pattern to adopt |

### Direct integration feasibility

**Partially feasible.** TypeScript, same language as agent-core. However, claude-mem uses `bun:sqlite` (Bun-specific), not `better-sqlite3`. The SessionStore schema is very complex (32 migration steps) and tightly coupled to claude-mem's observation model.

### Adapter feasibility

**Feasible — TypeScript adapter.** The `TimelineService` and timeline data model can be extracted almost directly. The `SessionStore` would need its `bun:sqlite` calls replaced with `better-sqlite3` equivalents (API is similar: `db.prepare().run()`, `db.query().all()`).

### Recommended integration strategy

**Direct (partial).** Extract `TimelineService` logic (buildTimeline, filterByDepth, formatTimeline) as reference for agent-core's session/trace timeline. Use claude-mem's schema migration pattern as reference for future schema evolution. The SessionStore is too complex to copy wholesale — adapt the concepts.

### What NOT to copy

- `bun:sqlite` import paths (replace with `better-sqlite3`)
- 32-step migration chain (start fresh with our schema)
- ChromaSync integration (external dependency)
- Worker/plugin lifecycle management
- ModeManager and platform-source normalization

### Dependency risk

Low for extracted logic. Medium if importing SessionStore directly (Bun dependency).

---

## 3. OpenViking (volcengine/OpenViking)

**Category:** Context  
**Language:** Python + Rust (crates/ragfs)  
**License:** AGPL-3.0  

### Files inspected

- `openviking/storage/viking_fs.py` — 2421 lines: VikingFS singleton, URI scheme (`viking://`), L0/L1 reading (`.abstract.md`, `.overview.md`), relation management (`.relations.json`), semantic search, vector sync
- `openviking/retrieve/hierarchical_retriever.py` — 627 lines: `HierarchicalRetriever` with dense/sparse vector support, rerank, convergence rounds, directory dominance scoring
- `crates/ragfs/src/core/plugin.rs` — Rust AGFS binding

### Key functions/classes worth using

| Symbol | Purpose | Portable? |
|--------|---------|-----------|
| `RelationEntry` dataclass | Typed relation with `id`, `uris`, `reason`, `created_at` | **Yes** — schema only |
| `HierarchicalRetriever.retrieve()` | Multi-level context retrieval with convergence | **Reference** — algorithm is portable, infra is not |
| L0/L1 URI convention (`.abstract.md`, `.overview.md`) | Hierarchical content levels per directory | **Yes** — naming convention to adopt |
| `DIRECTORY_DOMINANCE_RATIO`, `MAX_CONVERGENCE_ROUNDS` | Tuning constants for hierarchical retrieval | **Reference** |

### Direct integration feasibility

**Not feasible.** Python + Rust hybrid. Requires AGFS client (proprietary Volcengine service), custom embedder, rerank client. The VikingFS singleton has deep coupling to the Volcengine infra stack.

### Adapter/sidecar feasibility

**Not practical.** The AGFS backend is a proprietary service, not something we can run locally.

### Recommended integration strategy

**Reference only.** Use OpenViking's hierarchical retrieval algorithm and L0/L1 abstraction levels as design inspiration for agent-core's context tree. Do not attempt runtime integration.

### What NOT to copy

- VikingFS class (singleton, AGFS-coupled)
- URI scheme (`viking://`) — use our own path scheme
- Vector index backend (Volcengine-specific)
- Rust AGFS bindings

### Dependency risk

N/A — reference only. **License note:** AGPL-3.0 — do not copy code verbatim. Use as design reference only.

---

## 4. Letta (letta-ai/letta)

**Category:** Memory / Actions  
**Language:** Python  
**License:** Apache-2.0  

### Files inspected

- `letta/helpers/tool_rule_solver.py` — 298 lines: `ToolRulesSolver` Pydantic model with rule categorization, `get_allowed_tool_names()`, `is_terminal_tool()`, `has_required_tools_been_called()`, `compile_tool_rule_prompts()`, `guess_rule_violation()`, `should_force_tool_call()`
- `letta/schemas/tool_rule.py` — 373 lines: `BaseToolRule`, `ChildToolRule`, `InitToolRule`, `TerminalToolRule`, `ContinueToolRule`, `MaxCountPerStepToolRule`, `ParentToolRule`, `RequiredBeforeExitToolRule`, `RequiresApprovalToolRule`, `ConditionalToolRule`
- `letta/services/tool_manager.py` (located)

### Key functions/classes worth using

| Symbol | Purpose | Portable? |
|--------|---------|-----------|
| `ToolRulesSolver` | State machine: categorizes rules, tracks call history, computes allowed next tools | **Yes** — algorithm is pure logic, highly portable |
| `ToolRulesSolver.get_allowed_tool_names()` | Init rules → child/parent intersection → filter by available tools | **Yes** — core algorithm |
| `ToolRulesSolver.has_required_tools_been_called()` | Check required-before-exit rules against call history | **Yes** — pure set logic |
| `ToolRulesSolver.compile_tool_rule_prompts()` | Render rules as LLM prompt blocks | **Yes** — useful for prompt construction |
| `BaseToolRule` + subtypes | 9 rule types with `get_valid_tools()`, `render_prompt()` | **Yes** — Pydantic schemas, easily ported to Zod |
| `ChildToolRule.get_child_args_map()` | Prefilled argument propagation from parent→child tool calls | **Yes** — useful pattern |

### Direct integration feasibility

**Highly feasible for the rule solver.** The `ToolRulesSolver` is a self-contained state machine with no external dependencies beyond Pydantic. The algorithm (init rules → child/parent rule intersection → terminal/continue/approval checks) maps directly to agent-core's existing `rules/` module. The tool_rule schema types can be directly transliterated from Pydantic to Zod.

### Adapter feasibility

Not needed — direct port is simpler than a sidecar for this self-contained logic.

### Recommended integration strategy

**Direct integration — port ToolRulesSolver to TypeScript.** The algorithm is ~150 lines of pure logic. The 9 rule types are straightforward discriminated unions. This is the strongest candidate for direct code adaptation across all providers.

### What NOT to copy

- `letta/services/tool_manager.py` (server-side tool CRUD, ORM-coupled)
- `letta/prompts/prompt_generator.py` (prompt assembly — LLM-provider-specific)
- `letta/schemas/memory.py` (Letta's internal memory blocks — different model)
- Block/label system for prompt construction

### Dependency risk

None for the rule solver. Zero external dependencies beyond Pydantic types.

---

## 5. cognee (topoteretes/cognee)

**Category:** Knowledge / Skill traces  
**Language:** Python  
**License:** Apache-2.0  

### Files inspected

- `cognee/modules/retrieval/agentic_retriever.py` — 511 lines: `AgenticRetriever` extends `GraphCompletionRetriever`, ReAct-style loop with `AgentStep` (thought/tool_call/final_answer), progressive skill loading, ACL-checked tool execution
- `cognee/modules/tools/execute_tool.py` — 88 lines: scope check → lookup → permission check → handler invocation, 4 error types (`ToolScopeError`, `ToolPermissionError`, `ToolInvocationError`, `ToolNotFoundError`)

### Key functions/classes worth using

| Symbol | Purpose | Portable? |
|--------|---------|-----------|
| `AgentStep` schema | `thought` + optional `tool_call` + optional `final_answer` | **Yes** — Pydantic schema, trivial Zod port |
| `ToolCall` schema | `tool_name` + `arguments` dict | **Yes** — schema only |
| `execute_tool()` dispatcher | 4-check pipeline: scope → lookup → permission → invoke | **Yes** — algorithm pattern, portable |
| Error taxonomy | `ToolScopeError`, `ToolPermissionError`, `ToolInvocationError` | **Yes** — error categorization pattern |

### Direct integration feasibility

**Not feasible for runtime.** cognee requires Python + graph database + vector database + LLM provider. The `AgenticRetriever` extends `GraphCompletionRetriever` which depends on cognee's full infrastructure.

### Adapter feasibility

**Not practical.** Too many infrastructure dependencies for a sidecar. The value is in the patterns, not the runtime.

### Recommended integration strategy

**Reference only.** Use cognee's `execute_tool()` dispatcher pattern (scope→lookup→permission→invoke) as reference for agent-core's action execution pipeline. Adopt the `AgentStep` schema shape for trace recording. Do not integrate the retriever.

### What NOT to copy

- GraphCompletionRetriever inheritance chain
- Dataset/user ACL infrastructure
- Skill resolution and loading machinery
- LLM completion helpers

### Dependency risk

N/A — reference only.

---

## 6. Gemini CLI (google-gemini/gemini-cli)

**Category:** Routing / Classification  
**Language:** TypeScript  
**License:** Apache-2.0  

### Files inspected

- `packages/core/src/routing/modelRouterService.ts` — 135 lines: `ModelRouterService` with strategy chain initialization, `route()` method
- `packages/core/src/routing/routingStrategy.ts` — 81 lines: `RoutingStrategy`, `TerminalStrategy`, `RoutingContext`, `RoutingDecision` interfaces
- `packages/core/src/routing/strategies/classifierStrategy.ts` — 227 lines: LLM-based binary classifier (flash/pro), system prompt with rubric
- `packages/core/src/routing/strategies/numericalClassifierStrategy.ts` — 248 lines: LLM-based 1-100 complexity scorer with rubric
- `packages/core/src/routing/strategies/compositeStrategy.ts` — 122 lines: Chain of Responsibility pattern with terminal strategy guarantee

### Key functions/classes worth using

| Symbol | Purpose | Portable? |
|--------|---------|-----------|
| `RoutingStrategy` interface | `name` + `route(context, config, client) → Decision \| null` | **Yes** — TypeScript, directly usable |
| `TerminalStrategy` interface | Guaranteed non-null decision | **Yes** — TypeScript |
| `RoutingContext` / `RoutingDecision` | Input/output types for routing | **Yes** — adaptable types |
| `CompositeStrategy` | Chain of Responsibility with fallback to terminal | **Yes** — 60 lines of reusable logic |
| `ClassifierStrategy` prompt/rubric | Complexity classification rubric (SIMPLE vs COMPLEX) | **Reference** — prompt text |
| `NumericalClassifierStrategy` rubric | 1-100 complexity score rubric with 4 tiers | **Reference** — prompt text + schema |

### Direct integration feasibility

**Highly feasible.** Same language (TypeScript). The `RoutingStrategy` / `CompositeStrategy` pattern is generic and decoupled from Gemini-specific clients. The interfaces and composite pattern can be directly adapted.

### Adapter feasibility

Not needed — direct integration is simpler.

### Recommended integration strategy

**Direct integration.** Port the `RoutingStrategy` → `CompositeStrategy` chain pattern to agent-core's `ClassifierProvider`. Adapt the `RoutingContext`/`RoutingDecision` types to match agent-core's classification schema. Use the classifier rubric prompts as reference for future LLM-backed classification. **Do not import Gemini SDK dependencies** — only the strategy pattern and interfaces.

### What NOT to copy

- `@google/genai` SDK usage (Gemini-specific)
- `BaseLlmClient` / `LocalLiteRtLmClient` types (Gemini-specific clients)
- Config resolution (`config.getModel()`, `config.getNumericalRoutingEnabled()`)
- Telemetry (`ModelRoutingEvent`, `logModelRouting`)
- `GemmaClassifierStrategy` (Gemma-model-specific)

### Dependency risk

None for the pattern. The strategy interfaces have no external dependencies.

---

## 7. Parlant (emcie-co/parlant)

**Category:** Policy / Guideline matching  
**Language:** Python  
**License:** Apache-2.0  

### Files inspected

- `src/parlant/core/engines/alpha/guideline_matching/guideline_matcher.py` — 341 lines: `GuidelineMatcher`, `GuidelineMatchingStrategy` ABC, `GuidelineMatchingStrategyResolver` ABC, batch processing with retry, `GuidelineMatchingResult`/`ResponseAnalysisResult` dataclasses
- `src/parlant/core/engines/alpha/guideline_matching/generic/generic_guideline_matching_strategy.py` — 735 lines: `GenericGuidelineMatchingStrategy` with multiple batch types (observational, actionable, low-criticality, previously-applied, disambiguation, journey)

### Key functions/classes worth using

| Symbol | Purpose | Portable? |
|--------|---------|-----------|
| `GuidelineMatchingStrategy` ABC | `create_matching_batches()` + `create_response_analysis_batches()` + `transform_matches()` | **Reference** — abstract pattern |
| `GuidelineMatchingStrategyResolver` ABC | Strategy selection per guideline | **Reference** — resolver pattern |
| `GuidelineMatchingResult` dataclass | `total_duration`, `batch_count`, `batch_generations`, `matches` | **Yes** — result shape |
| `GuidelineMatcher.match_guidelines()` | Group by strategy → create batches → parallel process with retry → transform | **Reference** — orchestration pattern |
| Batch retry with `@policy([retry(max_exceptions=3)])` | Declarative retry policy | **Reference** — decorator pattern |

### Direct integration feasibility

**Not feasible.** Parlant is a deeply layered Python framework with hexagonal architecture. The guideline matching system depends on `SchematicGenerator` (LLM-powered), `EngineContext`, `Journey` store, `RelationshipStore`, and many other Parlant-specific abstractions. The `GenericGuidelineMatchingStrategy` alone has 10+ specialized batch types.

### Adapter/sidecar feasibility

**Sidecar possible but heavy.** Parlant has its own FastAPI server, so it could run as a sidecar. However, the setup complexity (LLM provider, guideline store, journey store) makes this impractical for Phase 1.

### Recommended integration strategy

**Reference only.** Use Parlant's strategy resolver + batch processing pattern as design inspiration for agent-core's `PolicyMatcherProvider`. The `GuidelineMatchingResult` shape is a good model for our policy match results. Do not attempt to run Parlant as a sidecar in Phase 1.

### What NOT to copy

- `GenericGuidelineMatchingStrategy` (735 lines, 10+ batch types, deeply coupled)
- `EngineContext` and all engine-level abstractions
- Journey/relationship store dependencies
- `SchematicGenerator` (LLM prompt infrastructure)
- Hexagonal architecture wiring

### Dependency risk

N/A — reference only.

---

## 8. Chroma (chroma-core/chroma)

**Category:** Search / Retrieval backend  
**Language:** Python + Rust  
**License:** Apache-2.0  

### Files inspected

- General repository structure review

### Recommended integration strategy

**Reference only / optional future backend.** Chroma is a vector database, not a component to integrate directly into agent-core. If agent-core needs vector search in the future, Chroma could be used as a backing store behind the MemoryProvider interface, similar to how mem0 uses it.

### Dependency risk

Low — well-maintained, Apache-2.0.

---

## 9. PageIndex (VectifyAI/PageIndex)

**Category:** Search / Document retrieval  
**Language:** Python  
**License:** MIT  

### Files inspected

- General repository structure review

### Recommended integration strategy

**Reference only.** PageIndex provides document tree retrieval patterns. Useful as design reference for how agent-core's context tree could support document-level retrieval. No runtime integration planned.

### Dependency risk

Low — MIT license, small project.

---

## Summary Matrix

| Provider | Language | License | Strategy | Rationale |
|----------|----------|---------|----------|-----------|
| **mem0** | Python | Apache-2.0 | **Sidecar planned** | Full memory pipeline requires Python + LLM + vector store |
| **claude-mem** | TypeScript | MIT | **Direct (partial)** | Timeline logic portable; SessionStore needs bun→better-sqlite3 adaptation |
| **OpenViking** | Python+Rust | AGPL-3.0 | **Reference only** | Proprietary AGFS backend; AGPL prevents code copying |
| **Letta** | Python | Apache-2.0 | **Direct integration** | ToolRulesSolver is self-contained pure logic, ideal for TS port |
| **cognee** | Python | Apache-2.0 | **Reference only** | Patterns useful, runtime requires full infra stack |
| **Gemini CLI** | TypeScript | Apache-2.0 | **Direct integration** | Strategy pattern + CompositeStrategy directly usable in TS |
| **Parlant** | Python | Apache-2.0 | **Reference only** | Deep framework coupling; patterns useful for design |
| **Chroma** | Python+Rust | Apache-2.0 | **Reference only** | Vector DB backend, not a component to embed |
| **PageIndex** | Python | MIT | **Reference only** | Document retrieval reference |

### Priority order for real integration

1. **Letta ToolRulesSolver** → Direct TS port (highest value, lowest risk)
2. **Gemini CLI strategy pattern** → Direct TS adaptation (same language, clean interfaces)
3. **claude-mem TimelineService** → Extract timeline logic (same language, useful patterns)
4. **mem0** → HTTP sidecar adapter (Phase 2, requires Python runtime)
