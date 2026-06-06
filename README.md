# agent-core

Standalone memory and action service for an agent-aware development platform.

**This is not the full platform.** This repo provides the memory/action substrate that a future platform will call. The future platform will own sessions, worktrees, executor routing, model routing, policy enforcement, quotas, approvals, audit, runner scheduling, commits, deployments, and UI. This repo owns only the memory, context, actions, tool rules, traces, and mock platform contract.

## Core thesis

- Memory proposes.
- Retrieval supplies context.
- Tool rules constrain local agent behavior.
- Policy authorization belongs to the future platform.
- The control plane records and authorizes everything.

## Quickstart

```bash
pnpm install
pnpm dev
# Server starts on http://localhost:3210
```

## Demo flow (curl)

```bash
# 1. Create a session
SESSION=$(curl -s -X POST http://localhost:3210/sessions \
  -H 'Content-Type: application/json' \
  -d '{"repo_id":"demo"}' | jq -r '.id')

# 2. Onboard a repo context
curl -s -X POST http://localhost:3210/context/repos/demo/onboard

# 3. Write a memory
MEM=$(curl -s -X POST http://localhost:3210/memory/write \
  -H 'Content-Type: application/json' \
  -d '{"scope":"repo","scope_id":"demo","content":"Always run tests before committing"}' | jq -r '.id')

# 4. Classify a task
curl -s -X POST http://localhost:3210/classify/task \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Fix a failing login test"}'

# 5. Search memory
curl -s -X POST http://localhost:3210/memory/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"tests","scope":"repo"}'

# 6. Get allowed next actions
curl -s -X POST http://localhost:3210/rules/allowed-next-actions \
  -H 'Content-Type: application/json' \
  -d '{"task_type":"code_edit","current_action":"classify_task"}'

# 7. Execute actions (mocked)
curl -s -X POST http://localhost:3210/actions/execute \
  -H 'Content-Type: application/json' \
  -d '{"action_name":"read_file","params":{"path":"src/index.ts"}}'

# 8. Record a trace
curl -s -X POST http://localhost:3210/traces/tool-call \
  -H 'Content-Type: application/json' \
  -d "{\"session_id\":\"$SESSION\",\"action_name\":\"read_file\",\"input\":{\"path\":\"src/index.ts\"},\"output\":{\"content\":\"...\"},\"duration_ms\":42}"

# 9. Extract memories from session text
curl -s -X POST http://localhost:3210/memory/extract \
  -H 'Content-Type: application/json' \
  -d "{\"session_id\":\"$SESSION\",\"text\":\"We should always run lint before committing. The repo requires Node 18+.\"}"

# 10. Get session timeline
curl -s http://localhost:3210/sessions/$SESSION/timeline
```

## Provider map

| Provider | Category | Role |
|----------|----------|------|
| mem0 | Memory | Memory extraction, retrieval, metadata filters |
| claude-mem | Knowledge | Session persistence, prompts, observations |
| OpenViking | Context | Context filesystem, hierarchical retrieval |
| Letta | Memory | Action registry, tool sequencing, prompt assembly |
| cognee | Knowledge | Skill traces, progressive skill loading |
| Gemini CLI | Routing | Classifier/router strategy pattern |
| Parlant | Policy | Guideline/policy matching |
| Chroma | Search | Retrieval backend reference |
| PageIndex | Search | Document/tree retrieval reference |

## Provider integration status

| Provider | Interface | Strategy | Status |
|----------|-----------|----------|--------|
| mem0 | MemoryProvider | Sidecar planned | Mocked — SQLite LIKE search fallback |
| claude-mem | SessionProvider | Direct (partial) | Timeline adapter extracted; session CRUD mocked |
| OpenViking | ContextProvider | Reference only | Mocked — static context tree |
| Letta | RuleSolverProvider, ActionProvider | Direct integration | Mocked — ToolRulesSolver port planned |
| cognee | TraceProvider | Reference only | Mocked — SQLite trace store |
| Gemini CLI | ClassifierProvider | Direct integration | Mocked — keyword classifier |
| Parlant | PolicyMatcherProvider | Reference only | Mocked — static policy rules |
| Chroma | (backing store) | Reference only | Not integrated |
| PageIndex | (backing store) | Reference only | Not integrated |

Provider interfaces: `src/providers/` — 8 typed interfaces (MemoryProvider, SessionProvider, ContextProvider, ActionProvider, RuleSolverProvider, TraceProvider, ClassifierProvider, PolicyMatcherProvider).

See [docs/provider-integration-audit.md](docs/provider-integration-audit.md) for the full audit and [docs/decisions/0004-provider-adapter-strategy.md](docs/decisions/0004-provider-adapter-strategy.md) for the adapter strategy policy.

## Structure

```
agent-core/
  src/           # TypeScript API implementation
  docs/          # Architecture and design documentation
  vendor/        # Vendored provider repos and metadata
  tests/         # Vitest test suite
  scripts/       # Dev, vendor, and smoke test scripts
  examples/      # Demo repo fixture and HTTP examples
```

See [docs/architecture.md](docs/architecture.md) for the full design, [docs/phase-1-scope.md](docs/phase-1-scope.md) for scope boundaries, and [docs/future-platform-contract.md](docs/future-platform-contract.md) for how the future platform will call this service.
