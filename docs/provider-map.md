# Provider map

## mem0 — mem0ai/mem0

**Category:** Memory  
**Why included:** Primary reference for memory extraction, retrieval, metadata filters, and procedural memory. mem0 defines the patterns for identifying durable facts from conversations and sessions.  
**Relevant files/folders:** `mem0/memory/`, `mem0/configs/`, `mem0/embeddings/`  
**What we will copy/adapt:** Memory write/search/extract API patterns, metadata filtering, scope-based organization, memory lifecycle (create/update/delete/promote).  
**What we will not copy:** LLM provider integrations, embedding model management, production vector store backends. Those belong to the future platform.

## claude-mem — thedotmack/claude-mem

**Category:** Knowledge / session traces  
**Why included:** Reference for coding-session persistence — how to record prompts, observations, tool calls, and build session timelines. Demonstrates practical session memory for development workflows.  
**Relevant files/folders:** Root-level implementation files  
**What we will copy/adapt:** Session event recording patterns, timeline assembly, observation extraction.  
**What we will not copy:** Claude-specific prompt formatting, MCP protocol details.

## OpenViking — volcengine/OpenViking

**Category:** Context  
**Why included:** Reference for structured context filesystems and hierarchical retrieval. Demonstrates how to organize repo knowledge as a navigable tree with relations between nodes.  
**Relevant files/folders:** Core retrieval and indexing modules  
**What we will copy/adapt:** Context tree structure, hierarchical node organization, search within tree, cross-repo linking.  
**What we will not copy:** Production indexing infrastructure, distributed search.

## Letta — letta-ai/letta

**Category:** Memory / actions  
**Why included:** Reference for custom action registries, tool sequencing rules, and prompt assembly. Letta's tool-rule system (init/terminate rules, allowed transitions, before-exit requirements) directly informs our rules solver.  
**Relevant files/folders:** `letta/functions/`, `letta/agent/`, tool rule schemas  
**What we will copy/adapt:** Action registration patterns, tool-rule definitions (sequence, before_exit, approval_required), action schema validation.  
**What we will not copy:** Full agent loop, LLM integration, production persistence layer.

## cognee — topoteretes/cognee

**Category:** Knowledge / skill traces  
**Why included:** Reference for skill traces, scoped tools, and progressive skill loading. Shows how to build knowledge that improves with each session.  
**Relevant files/folders:** Core knowledge and task modules  
**What we will copy/adapt:** Skill trace patterns, progressive knowledge accumulation.  
**What we will not copy:** Graph database backends, production knowledge pipelines.

## Gemini CLI — google-gemini/gemini-cli

**Category:** Routing  
**Why included:** Reference for classifier/router strategy patterns. Demonstrates how to classify task intent, determine complexity, and route to appropriate execution strategies.  
**Relevant files/folders:** CLI classification and routing logic  
**What we will copy/adapt:** Task classification schema (intent, task_type, complexity, risk, ambiguity), routing strategy pattern.  
**What we will not copy:** Gemini API integration, terminal UI, file editing.

## Parlant — emcie-co/parlant

**Category:** Policy  
**Why included:** Reference for guideline and policy matching. Shows how to define rules, match actions against policies, and return structured allow/deny decisions.  
**Relevant files/folders:** Guideline matching engine, policy evaluation  
**What we will copy/adapt:** Policy rule definition, action-to-policy matching, structured policy check responses.  
**What we will not copy:** Production conversation engine, NLU pipeline, customer-facing features.

## Chroma — chroma-core/chroma (optional)

**Category:** Search  
**Why included:** Retrieval backend reference. If the future platform needs vector similarity search for memory retrieval, Chroma's API patterns will inform the adapter.  
**Relevant files/folders:** API client, collection management  
**What we will copy/adapt:** Collection/query API patterns for future vector store adapter.  
**What we will not copy:** Server infrastructure, embedding pipelines.

## PageIndex — VectifyAI/PageIndex (optional)

**Category:** Search  
**Why included:** Document/tree retrieval reference. Shows how to index and retrieve hierarchical document structures, relevant for context tree search.  
**Relevant files/folders:** Indexing and retrieval modules  
**What we will copy/adapt:** Hierarchical document retrieval patterns.  
**What we will not copy:** Production indexing infrastructure.
