# Action API

agent-core provides an action catalog, LLM-first planning, deterministic validation, and outcome recording. It does **not** execute actions — execution, permission enforcement, and commit authorization belong to the platform (jubilant-goggles).

## Governing Principle

```
LLM proposes.
agent-core validates.
jubilant-goggles authorizes and executes.
```

## Endpoints

### `GET /actions`

Returns the full action catalog with MCP-compatible schemas.

```json
{
  "actions": [
    {
      "name": "grep",
      "description": "Search repository files using a pattern.",
      "params_json_schema": { "type": "object", "required": ["pattern"], "properties": { "pattern": { "type": "string" } } },
      "output_json_schema": {},
      "risk": "low",
      "side_effects": [],
      "requires_platform_validation": true
    }
  ]
}
```

Every action includes `requires_platform_validation: true` — agent-core validates contracts, the platform validates runtime permissions.

### `GET /actions/:name`

Returns a single action definition by name.

### `POST /actions/plan`

**LLM-first action planning.** Primary planning endpoint. Replaces classifier-first routing.

The LLM planner receives only the actions visible in the current session. Actions not in `allowed_actions` are excluded from the catalog passed to the LLM.

**Request:**

```json
{
  "session_id": "s1",
  "repo_id": "my-repo",
  "prompt": "Fix the login bug and commit the fix.",
  "allowed_actions": ["retrieve_context", "grep", "read_file", "run_tests", "commit"],
  "mode_preference": "finite"
}
```

**Response:**

```json
{
  "ok": true,
  "plan": {
    "goal": "Fix the login bug and commit the fix.",
    "mode": "finite",
    "steps": [
      { "action_name": "retrieve_context", "params": { "query": "login bug" }, "rationale": "Load context.", "requires_platform_validation": true },
      { "action_name": "grep", "params": { "pattern": "login|auth" }, "rationale": "Find relevant files.", "requires_platform_validation": true },
      { "action_name": "run_tests", "params": {}, "rationale": "Validate fix.", "requires_platform_validation": true },
      { "action_name": "commit", "params": { "message": "fix: login bug" }, "rationale": "Checkpoint work.", "requires_platform_validation": true }
    ]
  },
  "schema_valid": true,
  "requires_platform_validation": true,
  "source": "llm_plan_validated_by_agent_core",
  "warnings": []
}
```

**Plan modes:**

| Mode | Behavior |
|------|----------|
| `finite` | Bounded sequence with a known end. |
| `loop` | Repeat until platform stops, user stops, guard blocks, or goal satisfied. |
| `open_ended` | Ongoing autonomous work with periodic checkpoints and plan refreshes. |

**Important:**
- Plans may contain `commit` if `commit` is in the session's `allowed_actions`.
- Plans are not capped at a fixed step count.
- Loop and open-ended plans are not rejected — the platform decides when to stop.
- The rule solver produces advisory warnings, not blocking errors (unless hard enforcement is configured).

### `POST /actions/validate-plan`

**Deterministic validation only. No LLM calls.**

Validates:
1. JSON shape matches plan schema.
2. Every action exists in the catalog.
3. Every action is in `allowed_actions`.
4. Every action's params validate against its Zod schema.
5. Every step has `requires_platform_validation: true`.
6. Plan mode is `finite`, `loop`, or `open_ended`.
7. `commit` appears only if `commit` is in `allowed_actions`.

Does **not** validate: platform permission, file safety, command safety, approvals, execution safety.

**Request:**

```json
{
  "allowed_actions": ["grep", "read_file", "run_tests"],
  "plan": {
    "goal": "Find and fix bug",
    "mode": "finite",
    "steps": [
      { "action_name": "grep", "params": { "pattern": "TODO" }, "requires_platform_validation": true },
      { "action_name": "run_tests", "params": {}, "requires_platform_validation": true }
    ]
  }
}
```

### `POST /actions/outcome`

Records what the platform actually executed. Feeds the outcome learning loop.

**Request:**

```json
{
  "session_id": "s1",
  "action_name": "run_tests",
  "params": { "suite": "unit" },
  "status": "succeeded",
  "output": { "passed": 42 },
  "duration_ms": 1234,
  "executor": "jubilant-goggles",
  "rationale": "Validate before commit."
}
```

Records a trace event and session event. Returns `{ recorded: true, outcome_id: "..." }`.

### `POST /actions/recommend-next`

Stepwise recommendations for agents that operate action-by-action. Delegates to `RuleSolverProvider.getAllowedNext()` and enriches with outcome stats.

### `GET /providers`

Returns the provider capability matrix: configured provider names, implementation type, status.

## Rule Solver

The Letta-style rule solver is demoted to advisory:

- **Default (radical mode):** LLM chooses freely from visible catalog. Rule solver produces warnings.
- **Hard enforcement:** Only when session settings explicitly request it.

Advisory warnings look like:

```json
{
  "warnings": [
    { "source": "rule_solver", "message": "summarize_diff usually appears before commit" }
  ]
}
```

## Execution Boundary

agent-core may produce finite, loop-mode, open-ended, and commit-capable plans. It **must not** execute them. It **must not** authorize commits. The platform decides whether commits actually happen and performs them.
