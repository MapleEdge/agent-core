# ADR 0001: Repository purpose

## Status
Accepted

## Context
We are building an agent-aware development platform. The full platform requires many components: sessions, worktrees, executors, model routing, memory, context, actions, rules, traces, policy, UI, billing, and deployments. Building everything at once risks coupling, scope creep, and premature optimization.

## Decision
Create a standalone repository (`agent-core`) that implements only the memory and action substrate. This repo provides HTTP APIs for memory, context, actions, tool rules, traces, and mock platform endpoints. It explicitly does not implement the full platform.

## Consequences
- The memory/action layer can be developed, tested, and iterated independently.
- The future platform can integrate by calling HTTP endpoints, not by importing library code.
- Provider code (mem0, Letta, etc.) can be studied and adapted without platform constraints.
- The clear boundary prevents this repo from growing into the platform by accident.
- Mock platform endpoints must be maintained until the real platform replaces them.
