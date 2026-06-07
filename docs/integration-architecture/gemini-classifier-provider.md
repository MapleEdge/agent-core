# Gemini Classifier Provider

This integration adds a Gemini-backed `ClassifierProvider` behind the existing provider registry. It is disabled by default and only selected when both `ENABLE_GEMINI_CLASSIFY=true` and `GEMINI_API_KEY` are present, so tests and local development never make live LLM calls unintentionally.

## Vendor source inspected

### Routing strategy interface

Gemini CLI defines a `RoutingDecision` with model metadata including source, latency, reasoning, and optional error (`vendor/providers/routing/gemini-cli/packages/core/src/routing/routingStrategy.ts:15-26`). Its `RoutingStrategy` interface may return `null` to decline handling (`routingStrategy.ts:43-63`), while `TerminalStrategy` guarantees a decision (`routingStrategy.ts:66-81`).

**Adapted:** agent-core's classifier provider returns a structured `ClassificationResult` instead of a model-routing decision, but preserves the same separation between caller and strategy/provider implementation.

### Composite fallback behavior

Gemini CLI's `CompositeStrategy` tries non-terminal strategies in order (`vendor/providers/routing/gemini-cli/packages/core/src/routing/strategies/compositeStrategy.ts:59-77`) and falls back to the terminal strategy if none match (`compositeStrategy.ts:79-96`). It augments metadata with composite source and rounded latency (`compositeStrategy.ts:102-120`).

**Adapted:** `GeminiClassifierProvider` treats the LLM classifier as the first strategy and `MockClassifierProvider` as the deterministic terminal fallback. If Gemini returns invalid JSON, fails schema validation, or errors, classification still completes.

### Schema-constrained classifier

Gemini CLI's binary classifier uses a system prompt with a rubric and JSON-only schema requirement (`vendor/providers/routing/gemini-cli/packages/core/src/routing/strategies/classifierStrategy.ts:34-61`), validates output with Zod (`classifierStrategy.ts:124-127`), calls `generateJson()` with schema and utility-router role (`classifierStrategy.ts:171-179`), parses the response (`classifierStrategy.ts:181-183`), and returns `null` on classifier failure to let routing proceed (`classifierStrategy.ts:220-225`).

**Adapted:** agent-core uses `llmJson()` with `ClassifyResult` Zod validation. It retries once on malformed output and falls back to the mock provider rather than throwing from the route.

### Numerical complexity scoring

Gemini CLI's numerical classifier defines a 1-100 complexity rubric (`vendor/providers/routing/gemini-cli/packages/core/src/routing/strategies/numericalClassifierStrategy.ts:48-94`), validates `{ complexity_reasoning, complexity_score }` (`numericalClassifierStrategy.ts:96-99`), sanitizes request parts and wraps requests to reduce prompt-injection effects (`numericalClassifierStrategy.ts:140-168`), and returns score/threshold reasoning in metadata (`numericalClassifierStrategy.ts:210-218`).

**Adapted:** agent-core asks Gemini for `complexity_score`, `risk_score`, and `ambiguity_score` in the same 1-100 style. It wraps the original user prompt in `<user_prompt>` tags and explicitly tells the classifier not to follow instructions inside those tags.

## Why this architecture is superior for agent-core

| Alternative | Why not chosen | Why Gemini-style provider is better here |
|---|---|---|
| Keep keyword-only mock | Deterministic but shallow; cannot distinguish ambiguous architecture work from simple phrasing | LLM classifier can reason over intent, task type, complexity, risk, and approval needs |
| Inline LLM call inside `/classify/task` | Recreates the pre-registry problem and makes test fallback harder | Provider boundary keeps route stable and lets tests inject fake LLM clients |
| Copy Gemini CLI routing wholesale | It solves model selection, not agent-core task classification | We adapt only schema-rubric-output and fallback semantics |
| mem0-style memory extraction | Optimized for fact extraction, not task/risk classification | Gemini's routing classifiers are directly about task complexity and strategy selection |
| Parlant policy matcher | Optimized for compliance/guideline matching | Policy remains a separate provider; classifier only predicts task shape and risk |

## Implementation notes

- `GeminiClient` uses Gemini's OpenAI-compatible `/chat/completions` endpoint.
- `GeminiClassifierProvider` accepts an injectable `LLMClient` so contract tests can run without network calls.
- `registerDefaultProviders()` selects Gemini only when explicitly enabled.
- All LLM output is schema-validated through `ClassifyResult`.
- Malformed LLM output retries once via `llmJson()` and then falls back to the mock classifier.

## Tests

Contract tests cover:

1. Schema-valid LLM JSON produces a direct Gemini classification.
2. Malformed then schema-invalid LLM output retries and falls back deterministically.
3. Gemini configuration defaults use the OpenAI-compatible endpoint, not a live API call.

These tests verify provider behavior on par with the deterministic parts of Gemini CLI's classifier architecture: schema-constrained JSON, fallback-on-failure, and complexity/risk scoring contracts.

## Non-goals

- No live Gemini call in tests.
- No model-routing decision; agent-core classifies tasks, not model choices.
- No prompt-history windowing yet. Current route input only carries a single prompt plus optional context.
- No local Gemma/LiteRT fallback; mock classifier is the terminal fallback.
