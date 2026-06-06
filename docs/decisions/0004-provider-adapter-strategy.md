# ADR 0004: Provider Adapter Strategy

## Status

Accepted

## Context

agent-core vendors 9 upstream provider repositories spanning Python, TypeScript, and Rust. We need a policy for how (and whether) to integrate each provider's code into agent-core's TypeScript runtime.

Key constraints:
- agent-core is TypeScript/Node.js
- 5 of 9 providers are Python-only, 1 is Python+Rust, 1 is TypeScript (Bun-native), 1 is TypeScript (Node-compatible), 1 is Python+Rust
- Some providers are tightly coupled to external infrastructure (vector stores, LLMs, proprietary backends)
- agent-core must remain independently runnable with mock fallbacks for all subsystems

## Decision

### Integration hierarchy (in order of preference)

1. **Direct integration** — When the provider is TypeScript and the relevant code is self-contained, port or adapt the logic directly into agent-core. Use this when:
   - Same language (TypeScript)
   - Code is a pure algorithm or schema with no heavy external dependencies
   - The logic is small enough to maintain inline (~300 lines or less)

2. **Adapter/sidecar integration** — When the provider requires a different runtime (Python) but provides high value. Run the provider as a separate process/service and call it over HTTP from a typed adapter in agent-core. Use this when:
   - Provider is Python and provides significant runtime value
   - Provider has its own HTTP API or can be wrapped in one
   - The overhead of a sidecar is justified by the capability

3. **Reference only** — When the provider's code is useful for design decisions but impractical to run. Extract patterns, schemas, and algorithms as design inspiration. Use this when:
   - Provider has deep coupling to proprietary infrastructure
   - Provider's license restricts code copying (AGPL)
   - Integration complexity exceeds value for current phase
   - Provider is primarily a database/backend (not application logic)

4. **Small internal reimplementation** — When neither direct integration nor adapter is practical, but we need the capability. Rewrite only the minimal algorithm in TypeScript, citing the original provider as reference. Use this only when:
   - The algorithm is well-understood and small
   - Direct integration or adapter integration is impractical
   - The capability is essential for agent-core's API contract

### Policy rules

- **Never rewrite large provider internals.** If a provider's value is in a 500+ line pipeline, use it via sidecar or reference only.
- **Copy only small, stable algorithms or contracts.** Schemas, state machines, and pure functions under ~300 lines are safe to port.
- **Keep future platform authority separate.** Provider integrations must not bypass the "memory proposes, platform authorizes" boundary. No provider adapter may directly execute side-effects that the future platform should authorize.
- **Mock providers are mandatory fallbacks.** Every provider interface must have a working mock implementation so agent-core runs without any external provider.
- **License compliance.** Do not copy code from AGPL-licensed providers. Use as design reference only.

### Provider assignments

| Interface | Primary provider | Strategy | Fallback |
|-----------|-----------------|----------|----------|
| MemoryProvider | mem0 | Sidecar planned | Mock (SQLite LIKE search) |
| SessionProvider | claude-mem | Direct (partial) | Mock (SQLite) |
| ContextProvider | OpenViking | Reference only | Mock (static tree) |
| ActionProvider | Letta | Direct (registry patterns) | Mock (in-memory registry) |
| RuleSolverProvider | Letta | Direct (ToolRulesSolver port) | Mock (static sequences) |
| TraceProvider | cognee | Reference only | Mock (SQLite) |
| ClassifierProvider | Gemini CLI | Direct (strategy pattern) | Mock (keyword classifier) |
| PolicyMatcherProvider | Parlant | Reference only | Mock (static rules) |

## Consequences

- agent-core can run standalone with zero external dependencies (all mocks)
- Real provider integration is incremental and opt-in
- Python providers require a sidecar process (operational complexity deferred to Phase 2)
- TypeScript providers (Gemini CLI, claude-mem) integrate with minimal friction
- AGPL-licensed code (OpenViking) is never copied, only referenced for design patterns
