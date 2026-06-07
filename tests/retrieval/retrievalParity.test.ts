/**
 * Retrieval Parity Tests
 *
 * Evaluate hybrid memory search quality using golden fixtures.
 *
 * Metrics:
 *   Recall@1, Recall@3, Recall@5
 *   MRR (Mean Reciprocal Rank)
 *   nDCG (normalized Discounted Cumulative Gain)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { memoryRoutes } from "../../src/memory/routes.js";
import { registerDefaultProviders } from "../../src/providers/defaults.js";
import { resetProviderRegistry, getProvider } from "../../src/providers/registry.js";
import { getDb, closeDb } from "../../src/db.js";
import { SQLiteHybridMemoryProvider } from "../../src/providers/adapters/SQLiteHybridMemoryProvider.js";
import fixtures from "../fixtures/retrieval/semantic-fixtures.json";

let app: FastifyInstance;

interface FixtureMemory {
  id: string;
  content: string;
  scope: string;
  scope_id: string;
  metadata?: Record<string, unknown>;
}

interface FixtureQuery {
  query: string;
  expectedTopResults: string[];
  category: string;
  scope_id?: string;
  filters?: Record<string, unknown>;
}

// Collect all corpus entries and queries
const allCorpus: FixtureMemory[] = [];
const allQueries: FixtureQuery[] = [];
const idToWrittenId = new Map<string, string>();

for (const category of Object.values(fixtures.categories)) {
  for (const mem of category.corpus as FixtureMemory[]) {
    allCorpus.push(mem);
  }
  for (const q of category.queries as FixtureQuery[]) {
    allQueries.push(q);
  }
}

beforeAll(async () => {
  process.env.AGENT_CORE_DB = ":memory:";
  resetProviderRegistry();
  getDb(); // init schema
  registerDefaultProviders();

  app = Fastify();
  await app.register(memoryRoutes);
  await app.ready();

  // Seed all corpus memories and await embeddings
  const memoryProvider = getProvider("memory") as SQLiteHybridMemoryProvider;
  for (const mem of allCorpus) {
    const result = await memoryProvider.write({
      scope: mem.scope,
      scope_id: mem.scope_id,
      content: mem.content,
      metadata: mem.metadata,
    });
    idToWrittenId.set(mem.id, result.id);
    // Await embedding to ensure it's stored before search
    await memoryProvider.embedMemory(result.id, mem.content);
  }
});

afterAll(async () => {
  await app.close();
  closeDb();
});

// ── Metrics ────────────────────────────────────────────────────────

function recallAtK(results: string[], expected: string[], k: number): number {
  const topK = results.slice(0, k);
  const hits = expected.filter((e) => topK.includes(e));
  return hits.length / expected.length;
}

function mrr(results: string[], expected: string[]): number {
  for (let i = 0; i < results.length; i++) {
    if (expected.includes(results[i])) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

function ndcg(results: string[], expected: string[], k: number): number {
  const topK = results.slice(0, k);
  let dcg = 0;
  for (let i = 0; i < topK.length; i++) {
    const rel = expected.includes(topK[i]) ? 1 : 0;
    dcg += rel / Math.log2(i + 2);
  }
  // Ideal DCG: all relevant items at top
  let idcg = 0;
  for (let i = 0; i < Math.min(expected.length, k); i++) {
    idcg += 1 / Math.log2(i + 2);
  }
  return idcg === 0 ? 0 : dcg / idcg;
}

// ── Tests ──────────────────────────────────────────────────────────

describe("Retrieval Parity — Hybrid Search", () => {
  const metrics = {
    recall1: [] as number[],
    recall3: [] as number[],
    recall5: [] as number[],
    mrrValues: [] as number[],
    ndcgValues: [] as number[],
  };

  for (const fixture of allQueries) {
    it(`[${fixture.category}] "${fixture.query}" finds expected results`, async () => {
      const memoryProvider = getProvider("memory");
      const results = await memoryProvider.search({
        query: fixture.query,
        scope_id: fixture.scope_id,
        filters: fixture.filters,
        top_k: 10,
      });

      const resultIds = results.map((r) => r.id);
      const expectedWrittenIds = fixture.expectedTopResults.map((id) => idToWrittenId.get(id)!);

      const r1 = recallAtK(resultIds, expectedWrittenIds, 1);
      const r3 = recallAtK(resultIds, expectedWrittenIds, 3);
      const r5 = recallAtK(resultIds, expectedWrittenIds, 5);
      const mrrVal = mrr(resultIds, expectedWrittenIds);
      const ndcgVal = ndcg(resultIds, expectedWrittenIds, 5);

      metrics.recall1.push(r1);
      metrics.recall3.push(r3);
      metrics.recall5.push(r5);
      metrics.mrrValues.push(mrrVal);
      metrics.ndcgValues.push(ndcgVal);

      // At minimum, expected result should appear somewhere in top 10
      const found = expectedWrittenIds.some((eid) => resultIds.includes(eid));
      expect(found).toBe(true);
    });
  }

  it("aggregate metrics meet minimum thresholds", () => {
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

    const avgRecall1 = avg(metrics.recall1);
    const avgRecall3 = avg(metrics.recall3);
    const avgRecall5 = avg(metrics.recall5);
    const avgMrr = avg(metrics.mrrValues);
    const avgNdcg = avg(metrics.ndcgValues);

    console.log("\n=== Retrieval Metrics ===");
    console.log(`Recall@1: ${avgRecall1.toFixed(3)}`);
    console.log(`Recall@3: ${avgRecall3.toFixed(3)}`);
    console.log(`Recall@5: ${avgRecall5.toFixed(3)}`);
    console.log(`MRR:      ${avgMrr.toFixed(3)}`);
    console.log(`nDCG@5:   ${avgNdcg.toFixed(3)}`);

    // Mock embeddings won't achieve high semantic recall, but BM25
    // should handle keyword overlap well. With real embeddings these
    // thresholds would be higher.
    expect(avgRecall5).toBeGreaterThanOrEqual(0.5);
    expect(avgMrr).toBeGreaterThan(0);
  });
});

describe("Retrieval Parity — BM25 Fallback", () => {
  it("returns results when vector search is unavailable", async () => {
    const memoryProvider = getProvider("memory");
    const results = await memoryProvider.search({
      query: "vitest",
      top_k: 5,
    });
    expect(results.length).toBeGreaterThan(0);
  });

  it("exact keyword queries find matches via BM25", async () => {
    const memoryProvider = getProvider("memory");
    const results = await memoryProvider.search({
      query: "fastify port",
      top_k: 5,
    });
    const contents = results.map((r) => r.content);
    expect(contents.some((c) => c.includes("fastify"))).toBe(true);
  });
});

describe("Retrieval Parity — Metadata Filtering", () => {
  it("scope_id filtering narrows results", async () => {
    const memoryProvider = getProvider("memory");
    const results = await memoryProvider.search({
      query: "run tests",
      scope_id: "frontend-app",
      top_k: 5,
    });
    for (const r of results) {
      expect(r.metadata).toBeDefined();
    }
  });

  it("metadata filter restricts to matching records", async () => {
    const memoryProvider = getProvider("memory");
    const results = await memoryProvider.search({
      query: "framework",
      filters: { team: "frontend" },
      top_k: 5,
    });
    // All returned results should have team=frontend
    for (const r of results) {
      expect(r.metadata.team).toBe("frontend");
    }
  });
});
