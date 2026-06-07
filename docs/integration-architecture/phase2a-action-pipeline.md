# Phase 2A: Action Execution Pipeline

Cognee-inspired action execution pipeline with 5-stage linear dispatch, structured error taxonomy, and integrated policy/rule checking.

## Vendor Source Inspected

### cognee `execute_tool()` — 4-stage dispatcher

**File:** `vendor/providers/knowledge/cognee/cognee/modules/tools/execute_tool.py` (88 lines)

**Function signature:**
```python
async def execute_tool(
    user: User,
    dataset_id: Optional[UUID],
    tool_name: str,
    args: Optional[Dict[str, Any]] = None,
    allowed_tools: Optional[List[str]] = None,
) -> Any:
```

**Stage-by-stage breakdown:**

| Stage | Line(s) | Logic | Control flow |
|-------|---------|-------|--------------|
| 1. Scope | 61-62 | `if allowed_tools is not None and tool_name not in allowed_tools: raise ToolScopeError(...)` | Simple list membership check. `allowed_tools` is passed in by the caller (AgenticRetriever). Static — no live query to a rule engine. |
| 2. Lookup | 64 | `tool = await get_tool(tool_name, dataset_id=dataset_id)` | Delegates to `registry.get_tool()` which checks `_BUILTIN_TOOLS` dict first, then the graph engine. Raises `ToolNotFoundError` on miss. |
| 3. Permission | 66-78 | `authorized = await get_authorized_existing_datasets(datasets=[dataset_id], permission_type=tool.permission_required, user=user)` | Dataset-level ACL check. Only runs when `dataset_id` is not None. Uses the same ACL path as the search API. Raises `ToolPermissionError` on denied. |
| 4. Invocation | 80-88 | `handler = resolve_handler(tool.handler_ref); return await handler(args, dataset=dataset, user=user, tool=tool)` | Imports the handler via dotted path, calls it. Wraps non-ToolError exceptions in `ToolInvocationError`. Re-raises `ToolPermissionError` and `ToolScopeError` from inside the handler (lines 84-85). |

**Return type:** `Any` — the raw handler return value. No structured result envelope.

**Error strategy:** Raises 4 exception types. Callers must `try/except` each type. No machine-readable error codes or structured error metadata.

### cognee `errors.py` — bare exception subclasses

**File:** `vendor/providers/knowledge/cognee/cognee/modules/tools/errors.py` (21 lines)

| Error class | Parent | Extra fields | Lines |
|-------------|--------|-------------|-------|
| `ToolError` | `Exception` | none | 4-5 |
| `ToolNotFoundError` | `ToolError` | none | 8-9 |
| `ToolPermissionError` | `ToolError` | none | 12-13 |
| `ToolScopeError` | `ToolError` | none | 16-17 |
| `ToolInvocationError` | `ToolError` | none | 20-21 |

All are empty subclasses with only a docstring — no `.code`, no structured metadata, no extra fields.

### cognee `registry.py` — 2-tier tool resolution

**File:** `vendor/providers/knowledge/cognee/cognee/modules/tools/registry.py` (157 lines)

| Function | Lines | Purpose |
|----------|-------|---------|
| `register_builtin_tool(tool)` | 27-29 | Adds to `_BUILTIN_TOOLS` dict (in-memory, global) |
| `resolve_handler(handler_ref)` | 32-54 | Imports via `importlib` from dotted-path or `module:attr` format. 3 failure modes: bad format, ImportError, not callable. |
| `get_tool(name, dataset_id)` | 57-66 | Checks `_BUILTIN_TOOLS` first, then `_find_tool_in_graph()`. Raises `ToolNotFoundError` on miss. |
| `list_tools_for_dataset(dataset_id)` | 69-73 | Returns all built-ins + graph-scoped tools. |
| `_find_tool_in_graph(name, dataset_id)` | 76-82 | Linear scan of graph tool nodes matching `name`. |
| `_query_tool_nodes(dataset_id)` | 90-137 | Graph engine query with 4 levels of fallback (import fail → init fail → no method → query fail). Returns `[]` on all failures. |
| `_coerce_tool(raw)` | 140-157 | Dict/model → Tool DataPoint conversion. Strips `metadata` key, validates with Pydantic. |

**Key design:** Graceful degradation — when the graph engine is unavailable, built-in tools still work. Graph lookup is O(n) scan.

### Parlant `guideline_matcher.py` — strategy pattern with metrics

**File:** `vendor/providers/policy/parlant/src/parlant/core/engines/alpha/guideline_matching/guideline_matcher.py` (280+ lines)

| Pattern | Lines | Relevance to our pipeline |
|---------|-------|--------------------------|
| `GuidelineMatchingStrategy` (ABC) | ~20-30 | Strategy interface with `evaluate()` method. We adapt this concept in our PolicyMatcherProvider.checkPolicy(). |
| `GuidelineMatchingStrategyResolver` | ~35-50 | Selects strategy per guideline type. We don't need this — we have a single policy matcher. |
| Batch processing with `safe_gather()` | ~180-220 | Parlant evaluates multiple guidelines in parallel. Our pipeline evaluates one action at a time (appropriate for synchronous dispatch). |
| Duration histograms via `Meter` | ~120-140 | Parlant records per-strategy timing metrics. Our pipeline records `duration_ms` on the PipelineResult — simpler but captures the same signal. |

### Letta `tool_rule_solver.py` — rule-based scope checking

**File:** `vendor/providers/memory/letta/letta/helpers/tool_rule_solver.py`

| Concept | Relevance |
|---------|-----------|
| `ToolRulesSolver` class | Our `RuleSolverProvider.getAllowedNext()` wraps this logic. It determines which tools are valid given the current task_type, last action, and action history. |
| Rule categories: InitToolRule, ChildToolRule, ConditionalToolRule, TerminalToolRule, RequiresApprovalToolRule | We port these as TypeScript rule types in `src/rules/`. The pipeline's scope stage queries the rule solver to get the allowed action set. |
| `get_allowed_tool_names()` | Direct equivalent of our `getAllowedNext()` return value's `.allowed` array. |

---

## Function-Level Comparison: agent-core vs cognee

### `executeActionPipeline()` vs `execute_tool()`

**File:** `src/actions/pipeline.ts:82-216` vs `execute_tool.py:31-88`

| Dimension | cognee `execute_tool()` | agent-core `executeActionPipeline()` | Verdict |
|-----------|------------------------|--------------------------------------|---------|
| **Stages** | 4 (scope→lookup→permission→invoke) | 5 (scope→lookup→permission→**validate**→invoke) | **+1 stage** — pre-invocation validation catches bad params before handler import |
| **Return type** | `Any` (raw handler output) | `PipelineResult` struct with `.success`, `.stage`, `.error`, `.execution`, `.duration_ms` | **Structured** — JSON-serializable, no try/except needed by caller |
| **Scope check** | `tool_name not in allowed_tools` — static list passed by caller | Queries `RuleSolverProvider.getAllowedNext()` with task_type + action history — **live rule evaluation** | **Dynamic** — scope adapts to completed actions via Letta-style rules |
| **Permission check** | `get_authorized_existing_datasets()` — dataset ACL only | `PolicyMatcherProvider.checkPolicy()` — returns `{allowed, requires_approval, approval_type, reason, matched_rules}` | **Richer** — approval workflows, rule evidence, structured denial reasons |
| **Validation** | None (handler validates internally) | `ActionProvider.validate()` before invocation | **Fail-fast** — bad params caught at stage 4 instead of inside stage 5 |
| **Tracing** | External (AgenticRetriever loop records separately) | Integrated `TraceProvider.recordToolCall()` at line 190-200, best-effort | **Co-located** — trace recording is part of the pipeline, not caller responsibility |
| **Error detail** | Exception `.args[0]` string only | `.error.code` + `.error.message` + optional `.error.approval_type`, `.error.allowed_actions`, `.error.validation_errors` | **Machine-readable** — HTTP clients can switch on `.code` without parsing strings |
| **Duration tracking** | None | `performance.now()` elapsed in ms on every result | **Observable** — enables latency monitoring without external instrumentation |

### Error classes: `ActionError` hierarchy vs `ToolError` hierarchy

**Files:** `src/actions/errors.ts` vs `cognee/modules/tools/errors.py`

| Our class | cognee equivalent | Extra fields we add | Rationale |
|-----------|------------------|--------------------|-----------| 
| `ActionError(message, code)` | `ToolError(message)` | `.code: string` | Machine-readable error codes for JSON API responses |
| `ActionScopeError(action, scope, allowedActions)` | `ToolScopeError(message)` | `.allowedActions: string[]` | Caller can display which actions are available |
| `ActionNotFoundError(action)` | `ToolNotFoundError(message)` | (none beyond `.code`) | Parity |
| `ActionPermissionError(action, reason, approvalType)` | `ToolPermissionError(message)` | `.approvalType: string \| null` | Enables approval workflow UIs — cognee has no equivalent |
| `ActionValidationError(action, errors)` | (no equivalent) | `.validationErrors: string[]` | New stage: pre-invocation parameter validation |
| `ActionInvocationError(action, reason)` | `ToolInvocationError(message)` | (none beyond `.code`) | Parity |

### `PipelineResult` — no cognee equivalent

cognee's `execute_tool()` either returns the raw handler output or raises an exception. There is no unified result type. Our `PipelineResult` interface:

```typescript
interface PipelineResult {
  success: boolean;         // did the pipeline reach invoke and succeed?
  stage: PipelineStage;     // which stage produced this outcome
  execution?: ActionExecutionResult;  // populated when invoke stage was reached
  error?: {                 // populated on failure
    code: string;
    message: string;
    approval_type?: string;
    allowed_actions?: string[];
    validation_errors?: string[];
  };
  duration_ms: number;      // full pipeline elapsed time
}
```

**Why this is superior:** HTTP routes can `return result` directly — no try/catch, no exception-to-status-code mapping, no risk of unhandled exceptions leaking stack traces. The caller gets a single discriminated union: check `result.success` and `result.stage` to determine what happened.

## Competitive Assessment

| Criterion | cognee | agent-core | Winner |
|-----------|--------|------------|--------|
| Stage count | 4 | 5 | agent-core (validation stage) |
| Error granularity | 4 bare exception classes | 5 classes with `.code` + structured metadata | agent-core |
| Return type | raw `Any` (exception-based) | typed `PipelineResult` struct | agent-core |
| Scope checking | static list from caller | live Letta rule solver query | agent-core |
| Permission model | dataset ACL | policy rules + approval workflows | agent-core |
| Tracing | external (caller responsibility) | integrated, best-effort | agent-core |
| Latency measurement | none | built-in `duration_ms` | agent-core |
| Registry resilience | graph fallback with graceful degradation | provider registry with status enum | cognee (more resilient to backend failures) |
| Multi-tenancy | per-user, per-dataset | single-tenant (Phase 2) | cognee (mature multi-tenancy) |

**Overall verdict:** agent-core's pipeline is architecturally competitive and superior to cognee's dispatcher in structured results, stage granularity, and integration breadth. cognee's advantage is in production multi-tenancy and graph-backed tool storage, which are out of scope for Phase 2.
