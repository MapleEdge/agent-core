/**
 * SQLiteEmbeddingStore — stores and retrieves vector embeddings in SQLite.
 *
 * Vectors are stored as compact Float32 BLOBs for space efficiency.
 * Search uses brute-force cosine similarity (correct before fast).
 *
 * Designed so a future VectorStore interface can wrap this without
 * significant refactoring.
 */

import { getDb } from "../db.js";
import { v4 as uuidv4 } from "uuid";

export interface VectorSearchResult {
  memoryId: string;
  score: number;
}

export class SQLiteEmbeddingStore {
  constructor() {
    this.ensureTable();
  }

  private ensureTable(): void {
    const db = getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory_embeddings (
        id TEXT PRIMARY KEY,
        memory_id TEXT NOT NULL,
        vector BLOB NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_memory_embeddings_memory_id
        ON memory_embeddings(memory_id);
    `);
  }

  /** Insert or update an embedding for a memory. */
  upsert(memoryId: string, vector: number[]): void {
    const db = getDb();
    const blob = vectorToBlob(vector);
    const existing = db
      .prepare("SELECT id FROM memory_embeddings WHERE memory_id = ?")
      .get(memoryId) as { id: string } | undefined;

    if (existing) {
      db.prepare("UPDATE memory_embeddings SET vector = ?, created_at = datetime('now') WHERE memory_id = ?")
        .run(blob, memoryId);
    } else {
      db.prepare("INSERT INTO memory_embeddings (id, memory_id, vector, created_at) VALUES (?, ?, ?, datetime('now'))")
        .run(uuidv4(), memoryId, blob);
    }
  }

  /** Delete embedding for a memory. */
  delete(memoryId: string): void {
    getDb().prepare("DELETE FROM memory_embeddings WHERE memory_id = ?").run(memoryId);
  }

  /** Brute-force cosine similarity search. Returns top results sorted by score descending. */
  search(queryVector: number[], limit: number): VectorSearchResult[] {
    const db = getDb();
    const rows = db
      .prepare("SELECT memory_id, vector FROM memory_embeddings")
      .all() as Array<{ memory_id: string; vector: Buffer }>;

    const results: VectorSearchResult[] = [];
    for (const row of rows) {
      const storedVec = blobToVector(row.vector);
      const score = cosineSimilarity(queryVector, storedVec);
      results.push({ memoryId: row.memory_id, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /** Get embedding for a specific memory. */
  get(memoryId: string): number[] | null {
    const row = getDb()
      .prepare("SELECT vector FROM memory_embeddings WHERE memory_id = ?")
      .get(memoryId) as { vector: Buffer } | undefined;
    if (!row) return null;
    return blobToVector(row.vector);
  }

  /** Count stored embeddings. */
  count(): number {
    const row = getDb()
      .prepare("SELECT COUNT(*) as cnt FROM memory_embeddings")
      .get() as { cnt: number };
    return row.cnt;
  }
}

/** Encode number[] as compact Float32 BLOB. */
export function vectorToBlob(vector: number[]): Buffer {
  const buf = Buffer.alloc(vector.length * 4);
  for (let i = 0; i < vector.length; i++) {
    buf.writeFloatLE(vector[i], i * 4);
  }
  return buf;
}

/** Decode Float32 BLOB back to number[]. */
export function blobToVector(blob: Buffer): number[] {
  const count = blob.length / 4;
  const vec: number[] = new Array(count);
  for (let i = 0; i < count; i++) {
    vec[i] = blob.readFloatLE(i * 4);
  }
  return vec;
}

/** Cosine similarity between two vectors. Returns -1 to 1. */
export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}
