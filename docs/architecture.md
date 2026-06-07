# Architecture

## Overview

agent-core is a single HTTP service (Fastify + SQLite) that exposes memory, context, action knowledge, action recommendations, tool rules, traces, and mock platform endpoints. All state is stored in a local SQLite database.

```text
┌─────────────────────────────────────────────────┐
│                 Future Platform                  │
│       jubilant-goggles / control plane           │
│  (sessions, worktrees, executors, policy, UI)    │
│                                                  │
│  Calls agent-core HTTP APIs                      │
│  Executes real actions itself                    │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│               agent-core Service                 │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  Memory   │  │ Context  │  │   Actions     │  │
│  │  Store    │  │  Tree    │  │   Knowledge   │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  Rules   │  │  Traces  │  │  Classifier   │  │
│  │  Solver  │  │  Store   │  │  (mock)       │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │       Mock Platform Endpoints             │    │
│  │  (test doubles for repos, worktrees,      │    │
│  │   executors, policy, approvals, commits)  │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │              SQLite (WAL)                 │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

## Boundary

jubilant-goggles is the main platform and control plane. It owns:

1. User chat and UI
2. Repo checkout and source access
3. Sessions, branches, and worktrees
4. Executor selection and execution
5. Validation
6. Permissions and policy enforcement
7. Approval gates
8. Commits, pushes, PRs, deploys, and other real-world side effects

agent-core owns the memory and action substrate. It owns:

1. Memory storage, search, extraction, and promotion
2. Structured repo context memory
3. Session and tool traces
4. Action registry metadata
5. Action schemas
6. Action risk metadata
7. Action ordering recommendations
8. Allowed-next-action solving
9. Suggested action plans
10. Prompt/context assembly inputs for agents

agent-core knows what actions exist and can recommend which actions should be taken next. It does not validate whether the platform is allowed to execute them and does not perform real execution.

## Layers

### Memory layer

Responsible for writing, searching, extracting, and promoting durable memories. Memories are scoped (user, repo, branch, task, session, executor, global_policy). Memory extraction uses keyword-based heuristics to identify candidate durable facts from session text. The future platform can call this layer before, during, and after execution.

Reference: mem0ai/mem0

### Context layer

Responsible for structured repo context memory. Each onboarded repo gets a default context tree with nodes for overview, commands, architecture, dependencies, tests, entrypoints, known-failures, skills, sessions, and policy-notes. Context can be searched, linked across repos, and promoted with new knowledge.

Reference: volcengine/OpenViking

### Action knowledge registry

Responsible for registering and describing available actions. Default action metadata includes classify_task, read_file, grep, write_file, run_tests, summarize_diff, request_approval, commit, search_memory, and retrieve_context.

agent-core stores action names, descriptions, schemas, preconditions, expected outputs, risk metadata, sequencing hints, and trace semantics.

agent-core does not execute these actions in production. jubilant-goggles or its executors execute them after applying validation and permission checks.

Reference: letta-ai/letta

### Tool rule solver

Responsible for defining legal or recommended action sequences, answering "what should happen next?", and validating proposed sequences against task-type rules. Rules are per-task-type (for example, code_edit has a defined recommended sequence). Before-exit requirements and approval-required flags are represented as action metadata and recommendations.

The solver output is advisory to jubilant-goggles. jubilant-goggles is responsible for deciding whether the proposed action is permitted and then executing or rejecting it.

Reference: letta-ai/letta (tool rules)

### Trace store

Responsible for recording tool-call and skill-run traces. Traces are linked to sessions and include input, output, duration, result status, and optional rationale. Session timelines aggregate events and traces chronologically.

Reference: thedotmack/claude-mem

### Classifier (mock)

Responsible for classifying task intent, type, complexity, risk, and ambiguity. Returns suggested action sequences and approval requirements. Currently a keyword-based mock; future versions will use the Gemini CLI's strategy pattern.

Reference: google-gemini/gemini-cli

### Policy hints (mock)

Responsible for matching actions against soft policy and guideline rules. This layer may say that an action appears dangerous or should require approval, but it is not the final authorization layer.

Final validation, permissions, and enforcement belong to jubilant-goggles.

Reference: emcie-co/parlant

### Mock platform boundary

Simulates jubilant-goggles endpoints so that the rest of agent-core can be tested end-to-end. Mocks repos/open, worktrees/create, executors/select, policy/check, approvals/request, and commits/mock. Returns realistic fake responses.

These endpoints are test doubles only. They do not mean agent-core owns those platform responsibilities.

## Why agent-core does not authorize or execute real actions

Memory, context, and action recommendations are advisory. They propose, suggest, order, and record. They never execute real-world operations independently.

jubilant-goggles must:

1. Receive memory/context/action recommendations from agent-core
2. Apply its own validation, permissions, policy, quotas, and approval gates
3. Decide whether to execute
4. Delegate execution to a real executor
5. Send the result back to agent-core for tracing and memory extraction

This separation ensures that even if agent-core is compromised or misconfigured, it cannot spend money, deploy code, access secrets, modify files, run commands, push commits, or create PRs.
