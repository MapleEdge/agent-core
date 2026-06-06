import { FastifyInstance } from "fastify";
import { v4 as uuid } from "uuid";
import { getDb } from "../db.js";
import {
  MemoryWriteInput,
  MemorySearchInput,
  MemoryExtractInput,
  MemoryPromoteInput,
  MemoryPatchInput,
  MemoryExtractionResult,
} from "../schemas/memory.js";
import { isDeepSeekConfigured, DeepSeekClient, llmJson } from "../llm/index.js";

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  app.post("/memory/write", async (req, reply) => {
    const input = MemoryWriteInput.parse(req.body);
    const id = uuid();
    const db = getDb();
    db.prepare(
      `INSERT INTO memories (id, scope, scope_id, content, metadata)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, input.scope, input.scope_id, input.content, JSON.stringify(input.metadata));
    reply.code(201);
    return { id, scope: input.scope, scope_id: input.scope_id };
  });

  app.post("/memory/search", async (req) => {
    const input = MemorySearchInput.parse(req.body);
    const db = getDb();
    let sql = `SELECT * FROM memories WHERE content LIKE ?`;
    const params: unknown[] = [`%${input.query}%`];
    if (input.scope) {
      sql += ` AND scope = ?`;
      params.push(input.scope);
    }
    if (input.scope_id) {
      sql += ` AND scope_id = ?`;
      params.push(input.scope_id);
    }
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(input.limit);
    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    return {
      results: rows.map((r) => ({
        ...r,
        metadata: JSON.parse(r.metadata as string),
      })),
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
    const db = getDb();
    const row = db.prepare(`SELECT * FROM memories WHERE id = ?`).get(input.memory_id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return { error: "memory not found" };
    }
    const newId = uuid();
    db.prepare(
      `INSERT INTO memories (id, scope, scope_id, content, metadata)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(newId, input.target_scope, input.target_scope_id, row.content, row.metadata);
    return { id: newId, promoted_from: input.memory_id, scope: input.target_scope };
  });

  app.get("/memory/:memory_id", async (req) => {
    const { memory_id } = req.params as { memory_id: string };
    const db = getDb();
    const row = db.prepare(`SELECT * FROM memories WHERE id = ?`).get(memory_id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return { error: "not found" };
    }
    return { ...row, metadata: JSON.parse(row.metadata as string) };
  });

  app.patch("/memory/:memory_id", async (req) => {
    const { memory_id } = req.params as { memory_id: string };
    const input = MemoryPatchInput.parse(req.body);
    const db = getDb();
    if (input.content !== undefined) {
      db.prepare(`UPDATE memories SET content = ?, updated_at = datetime('now') WHERE id = ?`).run(
        input.content,
        memory_id,
      );
    }
    if (input.metadata !== undefined) {
      db.prepare(
        `UPDATE memories SET metadata = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(JSON.stringify(input.metadata), memory_id);
    }
    const row = db.prepare(`SELECT * FROM memories WHERE id = ?`).get(memory_id);
    return row ?? { error: "not found" };
  });

  app.delete("/memory/:memory_id", async (req, reply) => {
    const { memory_id } = req.params as { memory_id: string };
    const db = getDb();
    db.prepare(`DELETE FROM memories WHERE id = ?`).run(memory_id);
    reply.code(204);
    return;
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
