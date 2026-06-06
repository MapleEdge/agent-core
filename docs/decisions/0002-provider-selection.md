# ADR 0002: Provider selection

## Status
Accepted

## Context
We need reference implementations for memory, context, actions, routing, policy, and retrieval. Many open-source projects implement parts of what we need.

## Decision
Vendor the following providers:

| Provider | Role | Type |
|----------|------|------|
| mem0ai/mem0 | Memory extraction and retrieval | Adapter target |
| thedotmack/claude-mem | Session persistence and timeline | Reference |
| volcengine/OpenViking | Context tree and hierarchical retrieval | Adapter target |
| letta-ai/letta | Action registry and tool rules | Adapter target |
| topoteretes/cognee | Skill traces and progressive learning | Future adapter |
| google-gemini/gemini-cli | Task classification strategy | Reference |
| emcie-co/parlant | Policy/guideline matching | Reference |
| chroma-core/chroma | Vector retrieval substrate | Future adapter |
| VectifyAI/PageIndex | Document/tree retrieval | Reference |

## Consequences
- Each provider is documented with metadata explaining why it is included and what we will adapt.
- Large providers are not committed to git but can be reproduced via the vendor script.
- We commit to studying these specific projects rather than searching for alternatives during phase 1.
- If a provider becomes unmaintained or changes license, we have a source snapshot to reference.
