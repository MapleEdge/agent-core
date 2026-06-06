# Architecture

## Overview

agent-core is a single HTTP service (Fastify + SQLite) that exposes memory, context, actions, rules, traces, and mock platform endpoints. All state is stored in a local SQLite database.

```
┌─────────────────────────────────────────────────┐
│                 Future Platform                  │
│  (sessions, worktrees, executors, policy, UI)    │
│                                                  │
│  Calls agent-core HTTP APIs                      │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│               agent-core Service                 │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  Memory   │  │ Context  │  │   Actions     │  │
│  │  Store    │  │  Tree    │  │   Registry    │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  Rules   │  │  Traces  │  │  Classifier   │  │
│  │  Solver  │  │  Store   │  │  (mock)       │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │       Mock Platform Endpoints             │    │
│  │  (repos, worktrees, executors, policy,    │    │
│  │   approvals, commits)                     │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │              SQLite (WAL)                 │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

## Layers

### Memory layer

Responsible for writing, searching, extracting, and promoting durable memories. Memories are scoped (user, repo, branch, task, session, executor, global_policy). Memory extraction uses keyword-based heuristics to identify candidate durable facts from session text. The future platform will replace this with LLM-powered extraction using mem0's patterns.

Reference: mem0ai/mem0

### Context layer

Responsible for structured repo context. Each onboarded repo gets a default context tree with nodes for overview, commands, architecture, dependencies, tests, entrypoints, known-failures, skills, sessions, and policy-notes. Context can be searched, linked across repos, and promoted (updated with new content).

Reference: volcengine/OpenViking

### Action registry

Responsible for registering, validating, and executing actions. Default actions include classify_task, read_file, grep, write_file, run_tests, summarize_diff, request_approval, commit, search_memory, and retrieve_context. All execution is mocked or local-safe only. Actions have risk metadata and approval flags.

Reference: letta-ai/letta

### Tool rule solver

Responsible for defining legal action sequences, answering "what can I do next?", and validating proposed sequences. Rules are per-task-type (e.g., code_edit has a defined sequence). Before-exit requirements and approval-required flags are enforced.

Reference: letta-ai/letta (tool rules)

### Trace store

Responsible for recording tool-call and skill-run traces. Traces are linked to sessions and include input, output, and duration. Session timelines aggregate events and traces chronologically.

Reference: thedotmack/claude-mem

### Classifier (mock)

Responsible for classifying task intent, type, complexity, risk, and ambiguity. Returns suggested action sequences and approval requirements. Currently a keyword-based mock; future versions will use the Gemini CLI's strategy pattern.

Reference: google-gemini/gemini-cli

### Policy (mock)

Responsible for matching actions against policy rules and simulating platform authorization. Dangerous actions (deploy, commit, payment, access_secrets) are gated. Returns allow/deny with approval requirements.

Reference: emcie-co/parlant

### Mock platform boundary

Simulates the future platform's endpoints so that the rest of agent-core can be tested end-to-end. Mocks repos/open, worktrees/create, executors/select, policy/check, approvals/request, and commits/mock. Returns realistic fake responses.

## Why memory does not authorize real actions

Memory and context are advisory. They propose, suggest, and record. They never execute real-world operations independently. The future platform must:

1. Receive the memory/action recommendations
2. Apply its own policy, quotas, and approval gates
3. Decide whether to execute
4. Delegate execution to a real executor
5. Send the result back to agent-core for tracing

This separation ensures that even if agent-core is compromised or misconfigured, it cannot spend money, deploy code, access secrets, or push commits.
