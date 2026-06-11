# Everything is a session

This scaffold treats every durable work object as a session: repositories, apps,
goals, work items, questions, validations, pull requests, deployments, artifacts,
runtime contexts, and adapters. A container session can hold any number of child
sessions, and containers can be nested without a fixed depth limit.

The core rule is preservation: mounting a session somewhere else never rewrites
that session's intrinsic identity. Its original title, purpose, event history,
parent lineage, and graph relationships remain intact.

## Why mounting is not moving

`mount_session` adds contextual placement with an edge such as `mounted_under`.
It does not remove previous parents or clear existing relationships.

`adapt_session` creates an adapter session explaining how a source session should
be interpreted in a target context. The adapter carries mappings, constraints,
non-goals, and projection rules.

Example:

```text
OpenHands repo session
  mounted_under -> Integrate OpenHands executor functionality

Adapt OpenHands executor behavior into platform
  adapts_from -> OpenHands repo session
  adapts_into -> Integrate OpenHands executor functionality
```

OpenHands remains a repo/reference session. The adapter says which behaviors are
useful in the goal context.

## Session kinds

The initial domain model includes `repo`, `app`, `goal`, `work`, `question`,
`validation`, `pull_request`, `deployment`, `adapter`, `runtime`, `memory`,
`artifact`, and `container`.

## Composition

API and web repositories become one app session by creating an app/container
session and linking each repo with `component_of` edges:

```text
agent-core          component_of -> Agent Platform
jubilant-goggles   component_of -> Agent Platform
```

The repo sessions are not merged destructively. Their histories and future work
can still be inspected independently.

## Merge behavior

Merging creates a new composition session plus `merged_into` edges from each
source. Source sessions are not rewritten, deleted, or collapsed.
