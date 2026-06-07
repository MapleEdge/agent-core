import { FastifyInstance } from "fastify";
import {
  MemoryWriteInput,
  MemorySearchInput,
  MemoryExtractInput,
  MemoryPromoteInput,
  MemoryPatchInput,
  MemoryExtractionResult,
  MemoryIngestInput,
  MemoryRecallInput,
} from "../schemas/memory.js";
import { isDeepSeekConfigured, DeepSeekClient, llmJson } from "../llm/index.js";
import { getProvider } from "../providers/registry.js";
import { Mem0MemoryProvider } from "../providers/adapters/Mem0MemoryProvider.js";

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  app.post("/memory/write", async (req, reply) => {
    const input = MemoryWriteInput.parse(req.body);
    const memory = await getProvider("memory").write(input);
    reply.code(201);
    return { id: memory.id, scope: memory.scope, scope_id: memory.scope_id };
  });

  app.post("/memory/search", async (req) => {
    const input = MemorySearchInput.parse(req.body);
    const results = await getProvider("memory").search({
      query: input.query,
      scope: input.scope,
      scope_id: input.scope_id,
      filters: input.filters,
      top_k: input.limit,
    });
    return {
      results,
    };
  });

  app.post("/memory/extract", async (req) => {
    const input = MemoryExtractInput.parse(req.body);

    if (isDeepSeekConfigured() && process.env.ENABLE_LLM_EXTRACT === "true") {
      const llmResult = await extractWithLLM(input.text);
      if (llmResult) {
        return { session_id: input.session_id, candidates: llmResult };
      }
    }

    const candidates = extractCandidates(input.text);
    return {
      session_id: input.session_id,
      candidates,
    };
  });

  app.post("/memory/promote", async (req) => {
    const input = MemoryPromoteInput.parse(req.body);
    const source = await getProvider("memory").get(input.memory_id);
    if (!source) {
      return { error: "memory not found" };
    }
    const promoted = await getProvider("memory").write({
      scope: input.target_scope,
      scope_id: input.target_scope_id,
      content: source.content,
      metadata: source.metadata,
      kind: source.kind,
      facts: source.facts,
      concepts: source.concepts,
      files_read: source.files_read,
      files_modified: source.files_modified,
    });
    return { id: promoted.id, promoted_from: input.memory_id, scope: promoted.scope };
  });

  app.get("/memory/:memory_id", async (req) => {
    const { memory_id } = req.params as { memory_id: string };
    const memory = await getProvider("memory").get(memory_id);
    if (!memory) {
      return { error: "not found" };
    }
    return memory;
  });

  app.patch("/memory/:memory_id", async (req) => {
    const { memory_id } = req.params as { memory_id: string };
    const input = MemoryPatchInput.parse(req.body);
    const current = await getProvider("memory").get(memory_id);
    if (!current) return { error: "not found" };
    const updated = await getProvider("memory").update(memory_id, {
      content: input.content ?? current.content,
      metadata: input.metadata ?? current.metadata,
      kind: input.kind ?? current.kind,
      facts: input.facts ?? current.facts,
      concepts: input.concepts ?? current.concepts,
      files_read: input.files_read ?? current.files_read,
      files_modified: input.files_modified ?? current.files_modified,
    });
    return updated ?? { error: "not found" };
  });

  app.delete("/memory/:memory_id", async (req, reply) => {
    const { memory_id } = req.params as { memory_id: string };
    await getProvider("memory").delete(memory_id);
    reply.code(204);
    return;
  });

  // ── Mem0 passthrough routes ─────────────────────────────────────────
  //
  // These routes exercise the full production path:
  //   HTTP request → Mem0MemoryProvider → Mem0EmbeddedTransport
  //   → worker.py JSON-RPC → mem0.Memory
  //
  // They expose mem0's conversation-level operations (add with messages
  // array, search with user_id scoping, bulk delete) through agent-core's
  // API, allowing benchmark runners to exercise the embedded transport
  // end-to-end without bypassing any layer.

  app.post("/memory/ingest", async (req) => {
    const input = MemoryIngestInput.parse(req.body);
    const provider = getProvider("memory");

    if (!(provider instanceof Mem0MemoryProvider)) {
      return { error: "ingest requires MEMORY_PROVIDER=mem0" };
    }

    const transport = provider.getTransport();
    const startTime = performance.now();

    const params: Record<string, unknown> = {
      messages: input.messages,
      user_id: input.user_id,
      infer: true,
    };
    if (input.metadata) params.metadata = input.metadata;
    if (input.timestamp) params.timestamp = input.timestamp;
    if (input.custom_instructions) params.custom_instructions = input.custom_instructions;

    const result = await transport.call<Record<string, unknown>>({
      method: "add",
      params,
    });

    const latencyMs = performance.now() - startTime;
    return { ...result, _latency_ms: latencyMs, _transport: provider.transportMode };
  });

  app.post("/memory/recall", async (req) => {
    const input = MemoryRecallInput.parse(req.body);
    const provider = getProvider("memory");

    if (!(provider instanceof Mem0MemoryProvider)) {
      return { error: "recall requires MEMORY_PROVIDER=mem0" };
    }

    const transport = provider.getTransport();
    const startTime = performance.now();

    const params: Record<string, unknown> = {
      query: input.query,
      filters: { user_id: input.user_id },
      top_k: input.limit,
    };
    if (input.rerank) params.rerank = true;

    const result = await transport.call<Record<string, unknown>>({
      method: "search",
      params,
    });

    const latencyMs = performance.now() - startTime;
    return { ...result, _latency_ms: latencyMs, _transport: provider.transportMode };
  });

  app.delete("/memory/users/:user_id", async (req) => {
    const { user_id } = req.params as { user_id: string };
    const provider = getProvider("memory");

    if (!(provider instanceof Mem0MemoryProvider)) {
      return { error: "delete-user requires MEMORY_PROVIDER=mem0" };
    }

    const transport = provider.getTransport();
    await transport.call<Record<string, unknown>>({
      method: "delete_all",
      params: { user_id },
    });

    return { message: "Memories deleted", user_id };
  });
}

async function extractWithLLM(
  text: string,
): Promise<Array<{ content: string; confidence: number; scope?: string }> | null> {
  const client = new DeepSeekClient();
  const result = await llmJson(client, MemoryExtractionResult, [
    {
      role: "system",
      content: `You are a memory extraction system for a software development agent platform.
Given text from a coding session, extract durable facts, conventions, patterns, and lessons worth remembering.

Return valid JSON matching this schema:
{
  "candidates": [
    {
      "content": "The extracted fact or convention",
      "confidence": 0.0-1.0 float indicating relevance/importance,
      "scope": optional, one of "user", "repo", "branch", "task", "session", "executor", "global_policy"
    }
  ]
}

Guidelines:
- Extract facts that would be useful in future sessions (conventions, patterns, gotchas, preferences)
- Confidence: 0.9+ for explicit rules ("always", "never", "must"), 0.6-0.8 for conventions, 0.3-0.5 for observations
- Scope: "repo" for repo-specific facts, "user" for user preferences, "global_policy" for universal rules
- Return at most 10 candidates, sorted by confidence descending
- Skip trivial or ephemeral facts`,
    },
    { role: "user", content: text },
  ]);

  if (result.success) return result.data.candidates;
  return null;
}

function extractCandidates(text: string): { content: string; confidence: number }[] {
  const sentences = text
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
  const keywords = [
    "always",
    "never",
    "must",
    "should",
    "important",
    "remember",
    "note",
    "convention",
    "pattern",
    "prefer",
    "avoid",
    "requires",
    "depends",
  ];
  return sentences
    .map((s) => {
      const lower = s.toLowerCase();
      const matchCount = keywords.filter((k) => lower.includes(k)).length;
      const confidence = Math.min(0.95, 0.3 + matchCount * 0.15);
      return { content: s, confidence };
    })
    .filter((c) => c.confidence >= 0.4)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);
}
