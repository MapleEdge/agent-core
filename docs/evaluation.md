# LLM Evaluation

agent-core includes an evaluation framework for measuring LLM adapter quality against fixture-based test cases.

## Running

```bash
# Requires DeepSeek configuration
export DEEPSEEK_API_KEY=your-key-here
export ENABLE_LLM_EVALS=true
pnpm eval:llm
```

Without `ENABLE_LLM_EVALS=true`, the command exits cleanly with no API calls. Normal `pnpm test` never touches DeepSeek.

## Fixtures

| File | Purpose | Count |
|------|---------|-------|
| `tests/evals/classifier.fixtures.json` | Task classification accuracy | 10 |
| `tests/evals/memory-extraction.fixtures.json` | Memory extraction quality | 8 |

### Classifier Fixtures

Each fixture specifies:
- `prompt` — input to classify
- `expected.intent` — `"ask"` or `"do"`
- `expected.task_type` — expected classification category
- `expected.risk_range` — `[low, high]` acceptable risk score range
- `expected.complexity_range` — `[low, high]` acceptable complexity range

### Memory Extraction Fixtures

Each fixture specifies:
- `text` — input text to extract memories from
- `expected_min_candidates` — minimum number of extracted candidates
- `expected_keywords` — keywords that should appear in extracted content
- `expected_min_confidence` — minimum confidence threshold for top candidate

## Output

The eval runner prints per-fixture results and a summary:

```
=== Classifier Eval (10 fixtures) ===

  [0] PASS 1234ms | Fix a failing login test... → debug
  [1] PASS 987ms  | What does the authenticate function do?... → answer
  [2] FAIL 1100ms | Deploy the staging branch... → code_edit
       task_type: got "code_edit", expected "deploy"

=== SUMMARY ===

Classifier:
  total: 10
  passed: 9
  failed: 1
  accuracy: 90.0%
  schema_failure_rate: 0.0%
  latency_p50: 1050ms
  latency_p95: 1400ms
  total_tokens_in: 5200
  total_tokens_out: 1800
  estimated_cost_usd: $0.0012
```

### Metrics

| Metric | Description |
|--------|-------------|
| **accuracy** | Percentage of fixtures that pass all checks |
| **schema_failure_rate** | Percentage of responses that failed Zod validation (even after retry) |
| **latency_p50** | Median response time |
| **latency_p95** | 95th percentile response time |
| **total_tokens_in** | Total prompt tokens across all fixtures |
| **total_tokens_out** | Total completion tokens across all fixtures |
| **estimated_cost_usd** | Estimated API cost using published pricing |

### Score Deltas

For classifier fixtures, the eval checks:
- **Intent accuracy** — exact match (`ask`/`do`)
- **Task type accuracy** — exact match against expected category
- **Risk score delta** — must fall within `risk_range`
- **Complexity score delta** — must fall within `complexity_range`

## Adding Fixtures

Add entries to the JSON fixture files. Each fixture is independent — the eval runner processes them sequentially.

Classifier fixtures should cover edge cases:
- Ambiguous prompts
- Multi-category prompts (e.g., "fix a payment bug" → debug or payment_sensitive?)
- Short vs. long prompts

Extraction fixtures should cover:
- Dense convention text (many extractable facts)
- Ephemeral text (should produce few/no candidates)
- Mixed content (some durable, some ephemeral)

## CI Integration

LLM evals are **not** part of the normal CI pipeline. They require API credentials and incur costs. Run them manually or in a dedicated eval workflow with secrets configured.
