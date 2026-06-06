import { v4 as uuidv4 } from "uuid";
import { getDb } from "../../db.js";
import type {
  MemoryProvider,
  MemoryRecord,
  MemorySearchResult,
  MemoryWriteParams,
  MemorySearchParams,
} from "../MemoryProvider.js";
import type { ProviderStatus } from "../registry.js";

export class MockMemoryProvider implements MemoryProvider {
  readonly name = "mock-memory";
  readonly status: ProviderStatus = "mock";

  async write(params: MemoryWriteParams): Promise<MemoryRecord> {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();
    const meta = JSON.stringify(params.metadata ?? {});
    db.prepare(
      "INSERT INTO memories (id, scope, scope_id, content, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, params.scope, params.scope_id, params.content, meta, now, now);
    return { id, scope: params.scope, scope_id: params.scope_id, content: params.content, metadata: params.metadata ?? {}, created_at: now, updated_at: now };
  }

  async search(params: MemorySearchParams): Promise<MemorySearchResult[]> {
    const db = getDb();
    const conditions = ["content LIKE ?"];
    const values: unknown[] = [`%${params.query}%`];
    if (params.scope) { conditions.push("scope = ?"); values.push(params.scope); }
    if (params.scope_id) { conditions.push("scope_id = ?"); values.push(params.scope_id); }
    const limit = params.top_k ?? 10;
    const rows = db.prepare(
      `SELECT id, content, scope, metadata FROM memories WHERE ${conditions.join(" AND ")} LIMIT ?`,
    ).all(...values, limit) as Array<{ id: string; content: string; scope: string; metadata: string }>;
    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      scope: r.scope,
      score: 1.0,
      metadata: JSON.parse(r.metadata) as Record<string, unknown>,
    }));
  }

  async get(id: string): Promise<MemoryRecord | null> {
    const db = getDb();
    const row = db.prepare("SELECT * FROM memories WHERE id = ?").get(id) as
      | { id: string; scope: string; scope_id: string; content: string; metadata: string; created_at: string; updated_at: string }
      | undefined;
    if (!row) return null;
    return { ...row, metadata: JSON.parse(row.metadata) as Record<string, unknown> };
  }

  async update(id: string, content: string, metadata?: Record<string, unknown>): Promise<MemoryRecord | null> {
    const db = getDb();
    const now = new Date().toISOString();
    if (metadata) {
      db.prepare("UPDATE memories SET content = ?, metadata = ?, updated_at = ? WHERE id = ?").run(content, JSON.stringify(metadata), now, id);
    } else {
      db.prepare("UPDATE memories SET content = ?, updated_at = ? WHERE id = ?").run(content, now, id);
    }
    return this.get(id);
  }

  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = db.prepare("DELETE FROM memories WHERE id = ?").run(id);
    return result.changes > 0;
  }
}
