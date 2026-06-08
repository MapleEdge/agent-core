# ADR 0007: LLM-First Action Sequencing

## Status

Accepted

## Context

The original action sequencing system used a classifier-first approach: `POST /classify/task` determined the task type, then the Letta-style rule solver dictated the allowed next action based on hard-coded state machine transitions. This was deterministic and predictable but rigid — it could not adapt to novel prompts, multi-step reasoning, or open-ended autonomous work.

The target architecture requires:
- Plans that include `commit` (when authorized by the session).
- Loop-mode plans that run until the platform or user stops them.
- Open-ended plans with periodic checkpoints and plan refreshes.
- No artificial maximum step count.
- Clean separation: agent-core proposes and validates; the platform authorizes and executes.

## Decision

Replace classifier-first routing with **LLM-first action planning** as the primary planning path.

### New flow

```
User prompt + session context + visible action catalog
  → LLM generates a structured plan (JSON)
  → agent-core validates deterministically (Zod schemas, action visibility, mode)
  → agent-core attempts repair if validation fails
  → Rule solver produces advisory warnings (not blocking)
  → Platform receives validated plan and decides execution
```

### Key design choices

1. **LLM sees only session-visible actions.** If an action is not in `allowed_actions`, it is excluded from the catalog passed to the LLM and cannot be selected.

2. **Three plan modes:** `finite` (bounded), `loop` (repeat until stopped), `open_ended` (autonomous with checkpoints).

3. **Deterministic validation after generation.** No LLM in validation. Hard checks: JSON parse, schema match, known actions, visible actions, params validation, `requires_platform_validation` invariant.

4. **Rule solver demoted to advisory.** Default is "radical mode" — the LLM chooses the sequence. Schema/session validation is hard. Rule-solver sequence validation produces warnings unless session settings request hard enforcement.

5. **Repair before rejection.** Common LLM mistakes (missing `requires_platform_validation`, extra wrapper keys, unknown actions) are repaired before the plan is rejected.

6. **No step count cap.** Plans may have any number of steps. Loop and open-ended plans are not rejected for being long-running.

7. **Commit is allowed when visible.** If `commit` is in the session's `allowed_actions`, it may appear in the plan. agent-core does not authorize commits — the platform does.

### New files

| File | Purpose |
|------|---------|
| `src/actions/ActionPlanner.ts` | LLM planning orchestrator |
| `src/actions/actionPlanSchemas.ts` | Zod schemas for plan modes and steps |
| `src/actions/actionPromptBuilder.ts` | Builds LLM prompt from session + catalog |
| `src/actions/actionPlanValidator.ts` | Hard deterministic validation |
| `src/actions/actionPlanRepair.ts` | Repairs common LLM output mistakes |
| `src/actions/sampleTemplates.ts` | Example plans injected into LLM prompt |

### New endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /actions/plan` | LLM-first planning (primary) |
| `POST /actions/validate-plan` | Deterministic validation (no LLM) |
| `POST /actions/outcome` | Record platform execution results |
| `GET /providers` | Provider capability matrix |

## Consequences

- `/classify/task` remains for backward compatibility but is deprecated for action sequencing.
- The rule solver is not deleted — it produces advisory warnings that improve plan quality.
- Plans may include `commit`, `loop`, and `open_ended` modes. The platform must handle these appropriately.
- When no LLM client is configured (no API key), the planner falls back to template-based planning via `ActionKnowledgeProvider.buildPlan()`.
- Outcome recording (`POST /actions/outcome`) enables the outcome learning loop: traces → memories → better future recommendations.

## References

- Letta: tool registry, rule solver, sequence validation
- LangGraph: plans as resumable state, not flat arrays
- MCP: standardized action definitions with JSON Schema
- OpenHands/SWE-agent: action → observation trajectories
- cognee/claude-mem: trace → memory outcome learning
