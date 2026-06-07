import { v4 as uuidv4 } from "uuid";
import { getDb } from "../../db.js";
import type {
  MemoryKind,
  MemoryProvider,
  MemoryRecord,
  MemorySearchResult,
  MemoryUpdateParams,
  MemoryWriteParams,
  MemorySearchParams,
} from "../MemoryProvider.js";
import type { ProviderStatus } from "../registry.js";

interface MemoryRow {
  id: string;
  scope: string;
  scope_id: string;
  content: string;
  metadata: string;
  kind: MemoryKind;
  facts: string;
  concepts: string;
  files_read: string;
  files_modified: string;
  created_at: string;
  updated_at: string;
}

interface MemorySearchRow extends MemoryRow {
  rank?: number;
}

export class MockMemoryProvider implements MemoryProvider {
  readonly name = "mock-memory";
  readonly status: ProviderStatus = "mock";

  async write(params: MemoryWriteParams): Promise<MemoryRecord> {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();
    const row = {
      kind: params.kind ?? "manual",
      facts: params.facts ?? [],
      concepts: params.concepts ?? [],
      files_read: params.files_read ?? [],
      files_modified: params.files_modified ?? [],
      metadata: params.metadata ?? {},
    };
    db.prepare(
      `INSERT INTO memories
       (id, scope, scope_id, content, metadata, kind, facts, concepts, files_read, files_modified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      params.scope,
      params.scope_id,
      params.content,
      JSON.stringify(row.metadata),
      row.kind,
      JSON.stringify(row.facts),
      JSON.stringify(row.concepts),
      JSON.stringify(row.files_read),
      JSON.stringify(row.files_modified),
      now,
      now,
    );
    return {
      id,
      scope: params.scope,
      scope_id: params.scope_id,
      content: params.content,
      metadata: row.metadata,
      kind: row.kind,
      facts: row.facts,
      concepts: row.concepts,
      files_read: row.files_read,
      files_modified: row.files_modified,
      created_at: now,
      updated_at: now,
    };
  }

  async search(params: MemorySearchParams): Promise<MemorySearchResult[]> {
    const limit = params.top_k ?? 10;
    const ftsQuery = buildFtsQuery(params.query);
    const rows = ftsQuery ? this.searchFts(params, ftsQuery, limit) : this.searchLike(params, limit);
    const threshold = params.threshold ?? 0;
    return rows
      .map((row) => this.toSearchResult(row))
      .filter((result) => result.score >= threshold);
  }

  async get(id: string): Promise<MemoryRecord | null> {
    const row = getDb().prepare("SELECT * FROM memories WHERE id = ?").get(id) as MemoryRow | undefined;
    if (!row) return null;
    return toRecord(row);
  }

  async update(id: string, params: MemoryUpdateParams): Promise<MemoryRecord | null> {
    const current = await this.get(id);
    if (!current) return null;
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `UPDATE memories
         SET content = ?, metadata = ?, kind = ?, facts = ?, concepts = ?, files_read = ?, files_modified = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        params.content ?? current.content,
        JSON.stringify(params.metadata ?? current.metadata),
        params.kind ?? current.kind,
        JSON.stringify(params.facts ?? current.facts),
        JSON.stringify(params.concepts ?? current.concepts),
        JSON.stringify(params.files_read ?? current.files_read),
        JSON.stringify(params.files_modified ?? current.files_modified),
        now,
        id,
      );
    return this.get(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = getDb().prepare("DELETE FROM memories WHERE id = ?").run(id);
    return result.changes > 0;
  }

  private searchFts(params: MemorySearchParams, ftsQuery: string, limit: number): MemorySearchRow[] {
    const conditions = ["memories_fts MATCH ?"];
    const values: unknown[] = [ftsQuery];
    if (params.scope) {
      conditions.push("memories.scope = ?");
      values.push(params.scope);
    }
    if (params.scope_id) {
      conditions.push("memories.scope_id = ?");
      values.push(params.scope_id);
    }
    return getDb()
      .prepare(
        `SELECT memories.*, bm25(memories_fts) AS rank
         FROM memories_fts
         JOIN memories ON memories.rowid = memories_fts.rowid
         WHERE ${conditions.join(" AND ")}
         ORDER BY rank ASC
         LIMIT ?`,
      )
      .all(...values, limit) as MemorySearchRow[];
  }

  private searchLike(params: MemorySearchParams, limit: number): MemorySearchRow[] {
    const like = `%${params.query}%`;
    const conditions = [
      "(content LIKE ? OR facts LIKE ? OR concepts LIKE ? OR files_read LIKE ? OR files_modified LIKE ?)",
    ];
    const values: unknown[] = [like, like, like, like, like];
    if (params.scope) {
      conditions.push("scope = ?");
      values.push(params.scope);
    }
    if (params.scope_id) {
      conditions.push("scope_id = ?");
      values.push(params.scope_id);
    }
    return getDb()
      .prepare(`SELECT * FROM memories WHERE ${conditions.join(" AND ")} LIMIT ?`)
      .all(...values, limit) as MemorySearchRow[];
  }

  private toSearchResult(row: MemorySearchRow): MemorySearchResult {
    const record = toRecord(row);
    return {
      id: record.id,
      content: record.content,
      scope: record.scope,
      kind: record.kind,
      score: scoreFromRank(row.rank),
      metadata: record.metadata,
      facts: record.facts,
      concepts: record.concepts,
      files_read: record.files_read,
      files_modified: record.files_modified,
    };
  }
}

function toRecord(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    scope: row.scope,
    scope_id: row.scope_id,
    content: row.content,
    metadata: parseObject(row.metadata),
    kind: row.kind,
    facts: parseStringArray(row.facts),
    concepts: parseStringArray(row.concepts),
    files_read: parseStringArray(row.files_read),
    files_modified: parseStringArray(row.files_modified),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parseObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return {};
}

function parseStringArray(value: string): string[] {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
}

function buildFtsQuery(query: string): string {
  return (
    query
      .toLowerCase()
      .match(/[a-z0-9_/-]+/g)
      ?.map((token) => `${token.replace(/"/g, "")}*`)
      .join(" ") ?? ""
  );
}

function scoreFromRank(rank: number | undefined): number {
  if (rank === undefined) return 1;
  return 1 / (1 + Math.abs(rank));
}
