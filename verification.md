# Verification Transcript

## 1. Local command transcript

### pnpm typecheck
```
> agent-core@0.1.0 typecheck
> tsc --noEmit
(clean — no output)
```

### pnpm lint
```
> agent-core@0.1.0 lint
> eslint src/ tests/
(clean — no output)
```

### pnpm test
```
 ✓ tests/providers.test.ts (30 tests) 20ms
 ✓ tests/api.test.ts (35 tests) 85ms

 Test Files  2 passed (2)
      Tests  65 passed (65)
```

### bash scripts/smoke_test.sh
```
PASS  Health check
PASS  POST /sessions
PASS  POST /context/repos/demo/onboard
PASS  POST /memory/write
PASS  POST /classify/task
PASS  POST /memory/search
PASS  POST /rules/allowed-next-actions
PASS  POST /actions/execute classify_task
PASS  POST /actions/execute read_file
PASS  POST /actions/execute grep
PASS  POST /actions/execute run_tests
PASS  POST /traces/tool-call
PASS  POST /memory/extract
PASS  POST /memory/promote
PASS  GET /sessions/:id/timeline
PASS  GET /context/repos/:id/tree
PASS  GET /actions
PASS  POST /mock-platform/policy/check (safe)
PASS  POST /mock-platform/policy/check (dangerous)
PASS  POST /mock-platform/repos/open
PASS  POST /mock-platform/executors/select
=== Results: 21 passed, 0 failed ===
```

### pnpm eval:llm
```
> tsx scripts/eval_llm.ts
Skipping LLM evals (set ENABLE_LLM_EVALS=true to run)
```

## 2. pnpm eval:llm exits cleanly without ENABLE_LLM_EVALS=true

Confirmed — exit code 0, no API calls made, prints skip message.

## 3. curl output (mock mode)

### GET /health
```json
{"status":"ok","service":"agent-core"}
```

### POST /classify/task (mock mode)
```json
{
  "intent": "do",
  "task_type": "test_fix",
  "complexity_score": 24,
  "risk_score": 30,
  "ambiguity_score": 30,
  "estimated_steps": 6,
  "requires_approval": [],
  "suggested_sequence": ["classify_task","read_file","grep","write_file","run_tests","summarize_diff"],
  "reasoning": "[mock] Classified prompt as test_fix based on keyword analysis"
}
```

### POST /memory/extract (mock mode)
```json
{
  "session_id": "test-session",
  "candidates": [
    {"content":"We always run pnpm lint before committing","confidence":0.45},
    {"content":"Never push directly to main","confidence":0.45}
  ]
}
```

### POST /rules/allowed-next-actions (first action, null current)
```json
{
  "task_type": "code_edit",
  "current_action": null,
  "allowed": ["classify_task"],
  "reason": "First action in sequence",
  "uncalled_required": ["summarize_diff"],
  "requires_approval": []
}
```

### POST /rules/allowed-next-actions (after classify_task)
```json
{
  "task_type": "code_edit",
  "current_action": "classify_task",
  "allowed": ["read_file"],
  "reason": "Next in sequence after \"classify_task\"",
  "uncalled_required": ["summarize_diff"],
  "requires_approval": []
}
```

## 4. DeepSeek smoke test (ENABLE_LLM_CLASSIFY=true, ENABLE_LLM_EXTRACT=true)

Server started with DEEPSEEK_API_KEY, ENABLE_LLM_CLASSIFY=true, ENABLE_LLM_EXTRACT=true.

### POST /classify/task (DeepSeek)
```json
{
  "intent": "do",
  "task_type": "test_fix",
  "complexity_score": 40,
  "risk_score": 30,
  "ambiguity_score": 30,
  "estimated_steps": 5,
  "requires_approval": [],
  "suggested_sequence": ["classify_task","retrieve_context","read_file","grep","run_tests","write_file","run_tests","summarize_diff"],
  "reasoning": "User wants to fix a failing login test. This is a test fix task with moderate complexity and risk. Steps involve understanding the test, finding the issue, fixing code, and verifying."
}
```

### POST /memory/extract (DeepSeek)
```json
{
  "session_id": "test-session",
  "candidates": [
    {"content":"Always run pnpm lint before committing.","confidence":0.95,"scope":"repo"},
    {"content":"Never push directly to main.","confidence":0.95,"scope":"repo"},
    {"content":"The repo uses ESLint 9 with flat config.","confidence":0.9,"scope":"repo"}
  ]
}
```

DeepSeek returns richer output: higher confidence scores, scoped memories, detailed reasoning. Schema validation passes in both cases.

## 5. No secrets committed

```
git grep -n 'DEEPSEEK_API_KEY\|sk-\|api_key\|Bearer' -- src/ tests/ scripts/ ':!docs/deepseek.md'
```

Matches are only:
- `process.env.DEEPSEEK_API_KEY` reads (src/llm/DeepSeekClient.ts, scripts/eval_llm.ts)
- `Authorization: Bearer ${config.apiKey}` in HTTP client (standard pattern)
- Doc comments describing the env var name

No secret values, no hardcoded keys.

## 6. No live action execution beyond mock/local_safe

```
src/actions/routes.ts:89:  const execution_mode = input.action_name === "read_file" ? "local_safe" : "mock";
src/providers/ActionProvider.ts:44:  execution_mode: "mock" | "local_safe";
```

All action executions return either `"mock"` or `"local_safe"` (read_file reads from examples/demo_repo fixture only). No real side-effect execution.
