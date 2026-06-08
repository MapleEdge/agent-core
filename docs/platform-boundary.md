# Platform Boundary

## Core Principle

```
Memory proposes.
Retrieval supplies context.
Action knowledge recommends.
Tool rules constrain.
Policy authorizes.
Executors execute.
Control plane records everything.
```

## agent-core (advisory only)

Owns:
- Memory (episodic, semantic, working)
- Retrieval (embedding search, BM25, hybrid)
- Context (repo structure, file summaries)
- Action catalog (schemas, risk levels, side effects)
- Action schema validation
- Rule solver (Letta-style action sequencing rules)
- Advisory planning (LLM-first plan generation)
- Plan validation (shape, action membership)
- Next-action recommendations
- Trace/outcome storage

Does not own:
- Shell execution
- OpenHands execution
- Commits, pull requests, or deployments
- Approvals or authorization
- Runtime policy enforcement
- Session lifecycle
- Worktree management
- Live execution of any kind

Every agent-core response includes:
```json
{
  "advisory_only": true,
  "requires_platform_validation": true
}
```

Schema validation does not mean authorization. A valid action payload
is not permission to execute.

## jubilant-goggles (authoritative execution)

Owns:
- Sessions (create, inspect, destroy, pause, resume)
- Worktrees (git worktree lifecycle)
- OpenHands orchestration (canonical executor)
- Hatchet queue integration (durable scheduling)
- LangGraph single-action workflows (composite actions)
- Runtime policy (path guards, command blocking, approval gates)
- Executor routing (OpenHands primary, fallback for dev/test)
- Live feed (truthful event stream)
- Status feed (user-facing narration)
- Commits and PRs (approval-gated)
- Prompt routing (LLM classification)

Does not own:
- Memory or retrieval (delegates to agent-core)
- Action knowledge or schemas (delegates to agent-core)
- Planning intelligence (uses agent-core advisory plans)
- Repo context indexing (consumes agent-core context API)

## Integration Pattern

```
jubilant-goggles → agent-core: "What should I do?" (advisory)
jubilant-goggles → runtime policy: "Am I allowed?" (authoritative)
jubilant-goggles → OpenHands: "Do it." (execution)
jubilant-goggles → live feed: "Record what happened." (truth)
```

## Endpoints

### agent-core exposes (all advisory):
- `GET /actions` — catalog
- `POST /actions/plan` — plan generation
- `POST /actions/validate-plan` — plan shape check
- `POST /actions/validate` — action contract check
- `POST /actions/recommend-next` — next-action hint
- `POST /memory/search` — memory retrieval

### agent-core deprecated (410):
- `POST /actions/execute` — use /actions/mock-execute for simulation
- `POST /actions/pipeline` — use /actions/simulate-pipeline for simulation

### jubilant-goggles exposes (authoritative):
- `POST /api/sessions/:id/chat` — submit prompt for real execution
- `GET /api/sessions/:id/state` — truthful execution state
- `GET /api/sessions/:id/events` — raw event log
