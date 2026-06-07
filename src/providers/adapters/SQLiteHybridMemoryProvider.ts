/**
 * SQLiteHybridMemoryProvider — production memory provider with hybrid retrieval.
 *
 * Combines:
 *   - SQLite CRUD (source of truth)
 *   - FTS5 BM25 keyword search
 *   - Vector cosine similarity search (via SQLiteEmbeddingStore)
 *   - Hybrid reranking (configurable BM25/vector weights)
 *   - Metadata filtering
 *
 * Embedding failures never block memory writes — FTS fallback always works.
 */

import { v4 as uuidv4 } from "uuid";
import { getDb } from "../../db.js";
import type {
  MemoryKind,
  MemoryProvider,
  MemoryRecord,
  MemorySearchResult,
  MemorySearchParams,
  MemoryUpdateParams,
  MemoryWriteParams,
} from "../MemoryProvider.js";
import type { ProviderStatus } from "../registry.js";
import type { EmbeddingProvider } from "../EmbeddingProvider.js";
import { SQLiteEmbeddingStore } from "../../memory/SQLiteEmbeddingStore.js";

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

export interface HybridConfig {
  vectorWeight: number;
  bm25Weight: number;
}

const DEFAULT_CONFIG: HybridConfig = {
  vectorWeight: parseFloat(process.env.MEMORY_VECTOR_WEIGHT ?? "0.7"),
  bm25Weight: parseFloat(process.env.MEMORY_BM25_WEIGHT ?? "0.3"),
};

export class SQLiteHybridMemoryProvider implements MemoryProvider {
  readonly name = "sqlite-hybrid-memory";
  readonly status: ProviderStatus = "direct";

  private embeddingProvider: EmbeddingProvider;
  private embeddingStore: SQLiteEmbeddingStore;
  private config: HybridConfig;

  constructor(
    embeddingProvider: EmbeddingProvider,
    config?: Partial<HybridConfig>,
  ) {
    this.embeddingProvider = embeddingProvider;
    this.embeddingStore = new SQLiteEmbeddingStore();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── CRUD ──────────────────────────────────────────────────────────

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

    // Generate and store embedding — non-blocking, failure logged
    this.embedMemory(id, params.content).catch((err) => {
      console.error(`[hybrid-memory] embedding failed for ${id}:`, err);
    });

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

  async get(id: string): Promise<MemoryRecord | null> {
    const row = getDb()
      .prepare("SELECT * FROM memories WHERE id = ?")
      .get(id) as MemoryRow | undefined;
    return row ? toRecord(row) : null;
  }

  async update(id: string, params: MemoryUpdateParams): Promise<MemoryRecord | null> {
    const current = await this.get(id);
    if (!current) return null;
    const now = new Date().toISOString();
    const newContent = params.content ?? current.content;

    getDb()
      .prepare(
        `UPDATE memories
         SET content = ?, metadata = ?, kind = ?, facts = ?, concepts = ?, files_read = ?, files_modified = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        newContent,
        JSON.stringify(params.metadata ?? current.metadata),
        params.kind ?? current.kind,
        JSON.stringify(params.facts ?? current.facts),
        JSON.stringify(params.concepts ?? current.concepts),
        JSON.stringify(params.files_read ?? current.files_read),
        JSON.stringify(params.files_modified ?? current.files_modified),
        now,
        id,
      );

    // Re-embed if content changed
    if (params.content && params.content !== current.content) {
      this.embedMemory(id, newContent).catch((err) => {
        console.error(`[hybrid-memory] re-embedding failed for ${id}:`, err);
      });
    }

    return this.get(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = getDb().prepare("DELETE FROM memories WHERE id = ?").run(id);
    if (result.changes > 0) {
      this.embeddingStore.delete(id);
      return true;
    }
    return false;
  }

  // ── Search ────────────────────────────────────────────────────────

  async search(params: MemorySearchParams): Promise<MemorySearchResult[]> {
    const limit = params.top_k ?? 10;
    const threshold = params.threshold ?? 0;
    const fetchLimit = params.filters && Object.keys(params.filters).length > 0
      ? Math.max(limit * 10, 100)
      : Math.max(limit * 3, 30);

    // Stage 1: BM25 retrieval
    const bm25Results = this.searchBm25(params, fetchLimit);

    // Stage 2: Vector retrieval
    let vectorResults: Map<string, number> = new Map();
    try {
      const queryVec = await this.embeddingProvider.embed([params.query]);
      if (queryVec.length > 0) {
        const vecHits = this.embeddingStore.search(queryVec[0], fetchLimit);
        vectorResults = new Map(vecHits.map((h) => [h.memoryId, h.score]));
      }
    } catch {
      // Vector search failed — fall back to BM25 only
    }

    // Stage 3: Merge and rerank
    const candidateIds = new Set<string>();
    const bm25Map = new Map<string, number>();

    for (const row of bm25Results) {
      candidateIds.add(row.id);
      bm25Map.set(row.id, scoreFromRank(row.rank));
    }
    for (const [memId] of vectorResults) {
      candidateIds.add(memId);
    }

    // Fetch full records for all candidates
    const scoredResults: MemorySearchResult[] = [];
    for (const id of candidateIds) {
      const record = await this.get(id);
      if (!record) continue;

      // Apply metadata filters
      if (params.filters && !matchesMetadataFilters(record.metadata, params.filters)) continue;
      // Apply scope filters
      if (params.scope && record.scope !== params.scope) continue;
      if (params.scope_id && record.scope_id !== params.scope_id) continue;

      const bm25Score = bm25Map.get(id) ?? 0;
      const vecScore = vectorResults.get(id) ?? 0;

      // Normalize BM25 scores to [0, 1] range
      const maxBm25 = bm25Results.length > 0
        ? Math.max(...bm25Results.map((r) => scoreFromRank(r.rank)))
        : 1;
      const normalizedBm25 = maxBm25 > 0 ? bm25Score / maxBm25 : 0;

      // Hybrid score
      const hasVector = vectorResults.size > 0;
      const score = hasVector
        ? this.config.vectorWeight * vecScore + this.config.bm25Weight * normalizedBm25
        : bm25Score; // Pure BM25 fallback

      if (score < threshold) continue;

      scoredResults.push({
        id: record.id,
        content: record.content,
        scope: record.scope,
        kind: record.kind,
        score,
        metadata: record.metadata,
        facts: record.facts,
        concepts: record.concepts,
        files_read: record.files_read,
        files_modified: record.files_modified,
      });
    }

    scoredResults.sort((a, b) => b.score - a.score);
    return scoredResults.slice(0, limit);
  }

  // ── Embedding helpers ──────────────────────────────────────────────

  /** Generate and store embedding for a memory. Awaitable for tests. */
  async embedMemory(memoryId: string, content: string): Promise<void> {
    const vectors = await this.embeddingProvider.embed([content]);
    if (vectors.length > 0) {
      this.embeddingStore.upsert(memoryId, vectors[0]);
    }
  }

  /** Expose store for testing/inspection. */
  getEmbeddingStore(): SQLiteEmbeddingStore {
    return this.embeddingStore;
  }

  // ── BM25 search ────────────────────────────────────────────────────

  private searchBm25(params: MemorySearchParams, limit: number): MemorySearchRow[] {
    const ftsQuery = buildFtsQuery(params.query);
    if (!ftsQuery) return this.searchLike(params, limit);

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

    try {
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
    } catch {
      // FTS query syntax error — fall back to LIKE
      return this.searchLike(params, limit);
    }
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
}

// ── Shared helpers ────────────────────────────────────────────────

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

function matchesMetadataFilters(metadata: Record<string, unknown>, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([key, condition]) => {
    if (key === "AND") return everyFilter(condition, metadata);
    if (key === "OR") return someFilter(condition, metadata);
    if (key === "NOT") return notFilter(condition, metadata);
    return matchesMetadataValue(metadata[key], condition);
  });
}

function everyFilter(condition: unknown, metadata: Record<string, unknown>): boolean {
  return Array.isArray(condition) && condition.every((item) => isRecord(item) && matchesMetadataFilters(metadata, item));
}

function someFilter(condition: unknown, metadata: Record<string, unknown>): boolean {
  return Array.isArray(condition) && condition.some((item) => isRecord(item) && matchesMetadataFilters(metadata, item));
}

function notFilter(condition: unknown, metadata: Record<string, unknown>): boolean {
  return Array.isArray(condition) && condition.every((item) => isRecord(item) && !matchesMetadataFilters(metadata, item));
}

function matchesMetadataValue(value: unknown, condition: unknown): boolean {
  if (condition === "*") return value !== undefined;
  if (!isOperatorObject(condition)) return deepEqual(value, condition);
  return Object.entries(condition).every(([operator, expected]) => evaluateOperator(value, operator, expected));
}

function isOperatorObject(condition: unknown): condition is Record<string, unknown> {
  if (!isRecord(condition)) return false;
  return Object.keys(condition).some((key) =>
    ["eq", "ne", "in", "nin", "gt", "gte", "lt", "lte", "contains", "icontains"].includes(key),
  );
}

function evaluateOperator(value: unknown, operator: string, expected: unknown): boolean {
  switch (operator) {
    case "eq": return deepEqual(value, expected);
    case "ne": return !deepEqual(value, expected);
    case "in": return Array.isArray(expected) && expected.some((item) => deepEqual(value, item));
    case "nin": return Array.isArray(expected) && expected.every((item) => !deepEqual(value, item));
    case "gt": return typeof value === "number" && typeof expected === "number" && value > expected;
    case "gte": return typeof value === "number" && typeof expected === "number" && value >= expected;
    case "lt": return typeof value === "number" && typeof expected === "number" && value < expected;
    case "lte": return typeof value === "number" && typeof expected === "number" && value <= expected;
    case "contains": return containsValue(value, expected, false);
    case "icontains": return containsValue(value, expected, true);
    default: return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containsValue(value: unknown, expected: unknown, caseInsensitive: boolean): boolean {
  if (typeof expected !== "string") return false;
  if (typeof value === "string") {
    return caseInsensitive
      ? value.toLowerCase().includes(expected.toLowerCase())
      : value.includes(expected);
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsValue(item, expected, caseInsensitive));
  }
  return false;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
