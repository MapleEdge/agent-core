# Phase 1 demo flow

This document walks through a complete agent-core API flow, demonstrating how the future platform would interact with this service.

## Prerequisites

```bash
pnpm install
pnpm dev
```

Server runs on `http://localhost:3210`.

## Flow

### 1. Create a session

```bash
curl -s -X POST http://localhost:3210/sessions \
  -H 'Content-Type: application/json' \
  -d '{"repo_id":"demo"}'
```

### 2. Onboard the repo

```bash
curl -s -X POST http://localhost:3210/context/repos/demo/onboard
```

### 3. Write repo memories

```bash
curl -s -X POST http://localhost:3210/memory/write \
  -H 'Content-Type: application/json' \
  -d '{"scope":"repo","scope_id":"demo","content":"Always run tests before committing","metadata":{"source":"convention"}}'
```

### 4. Classify the task

```bash
curl -s -X POST http://localhost:3210/classify/task \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Fix a failing login test","repo_id":"demo"}'
```

### 5. Search memory for relevant context

```bash
curl -s -X POST http://localhost:3210/memory/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"tests","scope":"repo","scope_id":"demo"}'
```

### 6. Check allowed next actions

```bash
curl -s -X POST http://localhost:3210/rules/allowed-next-actions \
  -H 'Content-Type: application/json' \
  -d '{"task_type":"code_edit","current_action":"classify_task"}'
```

### 7. Execute actions

```bash
# Each mock action returns a realistic response
curl -s -X POST http://localhost:3210/actions/execute \
  -H 'Content-Type: application/json' \
  -d '{"action_name":"read_file","params":{"path":"src/auth.ts"}}'

curl -s -X POST http://localhost:3210/actions/execute \
  -H 'Content-Type: application/json' \
  -d '{"action_name":"run_tests","params":{}}'
```

### 8. Record traces

```bash
curl -s -X POST http://localhost:3210/traces/tool-call \
  -H 'Content-Type: application/json' \
  -d '{"session_id":"SESSION_ID","action_name":"read_file","input":{"path":"src/auth.ts"},"output":{"content":"..."},"duration_ms":42}'
```

### 9. Extract and promote memories

```bash
curl -s -X POST http://localhost:3210/memory/extract \
  -H 'Content-Type: application/json' \
  -d '{"session_id":"SESSION_ID","text":"We should always validate input. The auth module requires rate limiting."}'
```

### 10. Get session timeline

```bash
curl -s http://localhost:3210/sessions/SESSION_ID/timeline
```

## What this proves

- Memory, context, actions, rules, traces, and classification work end-to-end
- The mock platform boundary is explicit
- No real-world side effects occur
- The API is ready for future platform integration
