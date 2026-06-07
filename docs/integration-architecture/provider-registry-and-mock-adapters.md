# Provider Registry and Mock Adapter Integration

This document records the first vendor/provider integration pass that routes core HTTP endpoints through provider interfaces instead of inline SQL. It is intentionally based on direct vendor source inspection, with exact file/line citations.

## Integrated surface

Routes now resolve the following subsystems through `getProvider(...)`:

- `memory`
- `session`
- `context`
- `action`
- `trace`
- `classifier`
- `policyMatcher`
- existing `ruleSolver`

The service also exposes `GET /providers/capabilities` so consumers can inspect which provider backs each capability.

## Source-code evidence inspected

### Letta: rule execution as categorized constraints

Letta's `ToolRulesSolver` does not keep rules as a flat list. It categorizes rules into init, continue, child/conditional/max-count, parent filters, terminal, required-before-exit, and approval-required sets (`vendor/providers/memory/letta/letta/helpers/tool_rule_solver.py:24-51`). It then dispatches each input rule into the correct category during model initialization (`vendor/providers/memory/letta/letta/helpers/tool_rule_solver.py:66-86`). The solver also maintains execution history (`vendor/providers/memory/letta/letta/helpers/tool_rule_solver.py:88-94`) before computing the next allowlist (`vendor/providers/memory/letta/letta/helpers/tool_rule_solver.py:96-104`).

**Architecture preserved:** `ruleSolver` remains the one direct vendor-backed provider. Other routes now follow the same indirection boundary so future real providers can replace mocks without route rewrites.

### claude-mem: timelines as merged, sorted heterogeneous streams

claude-mem's `TimelineBuilder` merges observations, session summaries, and prompts into one array (`vendor/providers/knowledge/claude-mem/src/services/worker/search/TimelineBuilder.ts:31-48`), sorts by epoch (`TimelineBuilder.ts:50-51`), supports anchor-window filtering (`TimelineBuilder.ts:54-70`), and formats timelines with explicit anchor context (`TimelineBuilder.ts:96-140`).

**Architecture preserved:** `MockSessionProvider.getTimeline()` now treats session events and traces as a single mixed stream sorted by timestamp. It intentionally keeps the implementation smaller than claude-mem's full renderer because agent-core only needs a substrate contract, not user-facing timeline markdown.

### Parlant: policy as structured guideline matching

Parlant models policy matching as strategy-driven batches. Its matcher returns structured results with duration, batch counts, generation metadata, batches, and final matches (`vendor/providers/policy/parlant/src/parlant/core/engines/alpha/guideline_matching/guideline_matcher.py:68-98`). It defines abstract batch and strategy ports (`guideline_matcher.py:101-138`) instead of baking policy checks into API routes.

**Architecture preserved:** `MockPolicyMatcherProvider` converts persisted `policy_rules` into structured `PolicyRule` matches and returns a provider-level `PolicyMatchResult`. This is superior to the old route-local dangerous-action set because policy behavior is now swappable behind a port.

### mem0: memory search contract and filter expectations

mem0's search surface is explicit about `query`, `top_k`, `filters`, `threshold`, reranking, and explainability (`vendor/providers/memory/mem0/mem0/memory/main.py:1127-1136`). It documents rich metadata operators: `eq`, `ne`, `in`, `nin`, numeric comparisons, `contains`, wildcard, `AND`, `OR`, and `NOT` (`main.py:1148-1163`). It validates entity-scoping filters before searching (`main.py:1182-1200`) and separately detects/normalizes advanced operators (`main.py:1204-1209`).

**Architecture preserved now:** memory routes use `MemoryProvider` with scoped search parameters instead of inline SQL.  
**Deferred:** rich mem0-style metadata operator support remains a follow-up because the current SQLite table only stores JSON metadata as text.

### claude-mem memory schema: typed memory enrichment

claude-mem's Zod memory schema includes durable memory kinds (`observation`, `summary`, `prompt`, `manual`) and rich enrichment fields: `facts`, `concepts`, `filesRead`, and `filesModified` (`vendor/providers/knowledge/claude-mem/src/core/schemas/memory-item.ts:5-25`). Its create schema makes those enrichment fields optional (`memory-item.ts:28-44`).

**Deferred:** these fields are a good next memory-model enhancement, but they were not added in this provider-registry pass to keep the first PR focused on routing boundaries.

### Gemini CLI: precedence-aware skill discovery

Gemini CLI's `SkillManager` separates discovered skills, active skill state, and admin enablement (`vendor/providers/routing/gemini-cli/packages/core/src/skills/skillManager.ts:17-48`). It discovers skills in explicit precedence order: built-ins, extensions, user skills, user `.agents/skills`, workspace skills, and workspace `.agents/skills` (`skillManager.ts:50-99`), using trusted-workspace gating (`skillManager.ts:81-87`).

**Deferred:** skill discovery is not part of the provider-registry pass, but this is the source-backed architecture target for future skill loading.

## Comparative architecture assessment

| Area | Chosen architecture | Compared with | Why it is superior for agent-core now | Tradeoff |
|---|---|---|---|---|
| Provider boundary | Route → provider registry → implementation | Inline SQL in previous routes | Matches Letta/Parlant port-style isolation and allows swapping providers without API changes | More interface code |
| Rule solving | Direct Letta adapter | Re-implementing custom rules in routes | Letta has deterministic categorized rule semantics and existing parity tests | Still TS port, not Python package reuse |
| Timeline | claude-mem-inspired mixed stream | Separate `/events` and `/traces` query logic | Preserves chronological user/session/tool context like claude-mem | Formatting is intentionally simpler |
| Policy | Parlant-inspired structured matcher | Hardcoded `DANGEROUS_ACTIONS` inside route | Moves compliance decisions behind a policy port with structured rule evidence | Current matcher is still static/mock |
| Memory | Provider-backed scoped CRUD/search | Direct raw SQL in route | Enables future mem0 sidecar/Chroma adapter without route rewrites | Current search quality remains LIKE-backed |
| Capabilities | Exposed matrix endpoint | Hidden registry internals | Lets clients see mock/direct/adapter readiness at runtime | Requires providers to report metadata accurately |

## Implementation strategy used

1. Keep database schema stable.
2. Add missing mock providers that implement existing provider interfaces.
3. Register all built-in mocks and the direct Letta adapter from one `registerDefaultProviders()` function.
4. Replace route-local persistence logic with provider calls.
5. Expose the provider capability matrix over HTTP.
6. Add comprehensive route and provider tests before moving to the next vendor integration.

## Tests added/expanded

- Provider registry still verifies explicit provider status and capability matrix shape.
- Session/trace tests verify claude-mem-style mixed chronological timelines.
- Context tests verify hierarchical onboarding, label search, promoted-content search, and cross-repo links.
- Action tests verify registry exposure, required-parameter validation, and approval boundary preservation.
- Policy tests verify Parlant-inspired structured rule matching and dangerous-action gating.
- API tests verify provider-backed endpoints and `/providers/capabilities`.

## Non-goals for this pass

- No mem0 sidecar yet.
- No Chroma/vector search yet.
- No Gemini live classifier yet.
- No claude-mem memory enrichment fields yet.
- No Parlant LLM guideline matcher yet.

Those are separate integrations that should each get their own source-cited architecture note and vendor parity/contract tests.
