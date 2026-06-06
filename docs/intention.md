# Intention

## What I am building

I am building an agent-aware development platform. The future platform will support:

- Context-aware multi-session development
- Durable memory across sessions, repos, and users
- Action routing with tool-rule constraints
- Trace recording for every tool call and skill run
- Postmortems and progressive skill learning
- Approval-gated real-world operations (commits, deploys, payments)

## Why this repo exists

Building the full platform at once would be premature. The memory and action substrate is the foundation that everything else depends on. If memory, context, actions, and rules are wrong, the platform will be wrong.

This repo exists to build those foundations first, with stable HTTP endpoints, before implementing the platform. Every endpoint here will eventually be called by the platform's control plane, executor orchestrator, or session manager.

## What this repo is not

This repo is not the platform. It does not:

- Run real agent sessions
- Manage git worktrees
- Route to real executors (Aider, OpenHands, etc.)
- Deploy code
- Handle payments or provider signup
- Enforce production authentication
- Provide a user interface

Those responsibilities belong to the future platform, which will call this service's APIs.

## Design principle

Memory proposes. Retrieval supplies context. Tool rules constrain local agent behavior. Policy authorization belongs to the future platform. The control plane records and authorizes everything.

This separation ensures that the memory/action layer can never independently perform high-stakes operations. It can only recommend, validate, and record.
