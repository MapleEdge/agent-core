/**
 * Retrieval Performance Benchmarks
 *
 * Measure latency for:
 *   - embedding generation
 *   - vector search
 *   - hybrid search
 *   - memory write
 *
 * At corpus sizes: 100, 1000, 10000
 * Report: p50, p95, p99
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb, closeDb } from "../../src/db.js";
import { resetProviderRegistry, registerProvider } from "../../src/providers/registry.js";
import { MockEmbeddingProvider } from "../../src/providers/adapters/MockEmbeddingProvider.js";
import { SQLiteHybridMemoryProvider } from "../../src/providers/adapters/SQLiteHybridMemoryProvider.js";
import { SQLiteEmbeddingStore } from "../../src/memory/SQLiteEmbeddingStore.js";
import { MockSessionProvider } from "../../src/providers/mocks/MockSessionProvider.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

interface BenchResult {
  operation: string;
  corpusSize: number;
  count: number;
  p50: number;
  p95: number;
  p99: number;
}

const allResults: BenchResult[] = [];

let embeddingProvider: MockEmbeddingProvider;
let memoryProvider: SQLiteHybridMemoryProvider;
let embeddingStore: SQLiteEmbeddingStore;

beforeAll(() => {
  process.env.AGENT_CORE_DB = ":memory:";
  resetProviderRegistry();
  getDb();
  embeddingProvider = new MockEmbeddingProvider();
  memoryProvider = new SQLiteHybridMemoryProvider(embeddingProvider);
  embeddingStore = memoryProvider.getEmbeddingStore();

  registerProvider("memory", memoryProvider);
  registerProvider("embedding", embeddingProvider);
  registerProvider("session", new MockSessionProvider());
});

afterAll(() => {
  closeDb();
});

async function seedCorpus(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const mem = await memoryProvider.write({
      scope: "repo",
      scope_id: "bench",
      content: `benchmark memory entry ${i}: contains information about topic ${i % 50} with keywords alpha beta gamma delta epsilon`,
    });
    await memoryProvider.embedMemory(mem.id, mem.content);
  }
}

async function benchOp(name: string, corpusSize: number, count: number, fn: () => Promise<void>): Promise<BenchResult> {
  const latencies: number[] = [];
  for (let i = 0; i < count; i++) {
    const start = performance.now();
    await fn();
    latencies.push(performance.now() - start);
  }
  latencies.sort((a, b) => a - b);
  const result: BenchResult = {
    operation: name,
    corpusSize,
    count,
    p50: Number(percentile(latencies, 50).toFixed(2)),
    p95: Number(percentile(latencies, 95).toFixed(2)),
    p99: Number(percentile(latencies, 99).toFixed(2)),
  };
  allResults.push(result);
  return result;
}

describe("Retrieval Benchmark — Embedding Latency", () => {
  it("mock embedding ×100", async () => {
    const result = await benchOp("embedding", 0, 100, async () => {
      await embeddingProvider.embed(["test text for embedding generation"]);
    });
    expect(result.p95).toBeLessThan(1); // Mock is fast
  });
});

describe("Retrieval Benchmark — Small Corpus (100)", () => {
  it("seed 100 memories", async () => {
    await seedCorpus(100);
    expect(embeddingStore.count()).toBe(100);
  });

  it("vector search p95 < 10ms (100 corpus)", async () => {
    const queryVec = (await embeddingProvider.embed(["search query"]))[0];
    const result = await benchOp("vector_search", 100, 50, async () => {
      embeddingStore.search(queryVec, 10);
    });
    expect(result.p95).toBeLessThan(10);
  });

  it("hybrid search p95 < 50ms (100 corpus)", async () => {
    const result = await benchOp("hybrid_search", 100, 50, async () => {
      await memoryProvider.search({ query: "benchmark topic", top_k: 10 });
    });
    expect(result.p95).toBeLessThan(50);
  });

  it("memory write p95 < 20ms (100 corpus)", async () => {
    const result = await benchOp("memory_write", 100, 50, async () => {
      await memoryProvider.write({
        scope: "repo",
        scope_id: "bench",
        content: `write bench ${Date.now()}`,
      });
    });
    expect(result.p95).toBeLessThan(20);
  });
});

describe("Retrieval Benchmark — Medium Corpus (1000)", () => {
  it("seed to 1000 memories", async () => {
    await seedCorpus(900); // 100 already exist
    expect(embeddingStore.count()).toBeGreaterThanOrEqual(1000);
  }, 30000);

  it("vector search p95 < 50ms (1000 corpus)", async () => {
    const queryVec = (await embeddingProvider.embed(["search in larger corpus"]))[0];
    const result = await benchOp("vector_search", 1000, 30, async () => {
      embeddingStore.search(queryVec, 10);
    });
    expect(result.p95).toBeLessThan(50);
  });

  it("hybrid search p95 < 100ms (1000 corpus)", async () => {
    const result = await benchOp("hybrid_search", 1000, 30, async () => {
      await memoryProvider.search({ query: "benchmark memory topic", top_k: 10 });
    });
    expect(result.p95).toBeLessThan(100);
  });
});

describe("Retrieval Benchmark — Large Corpus (10000)", () => {
  it("seed to 10000 memories", async () => {
    await seedCorpus(9000); // 1000+ already exist
    expect(embeddingStore.count()).toBeGreaterThanOrEqual(10000);
  }, 120000);

  it("vector search p95 < 200ms (10000 corpus)", async () => {
    const queryVec = (await embeddingProvider.embed(["search in large corpus"]))[0];
    const result = await benchOp("vector_search", 10000, 10, async () => {
      embeddingStore.search(queryVec, 10);
    });
    expect(result.p95).toBeLessThan(200);
  });

  it("hybrid search p95 < 500ms (10000 corpus)", async () => {
    const result = await benchOp("hybrid_search", 10000, 10, async () => {
      await memoryProvider.search({ query: "benchmark topic keywords", top_k: 10 });
    });
    expect(result.p95).toBeLessThan(500);
  });
});

describe("Retrieval Benchmark — Report", () => {
  it("writes machine-readable benchmark output", () => {
    const report: Record<string, { p50: number; p95: number; p99: number; corpus: number }> = {};
    for (const r of allResults) {
      report[`${r.operation}_${r.corpusSize}`] = {
        p50: r.p50,
        p95: r.p95,
        p99: r.p99,
        corpus: r.corpusSize,
      };
    }

    const outputPath = join(process.cwd(), "retrieval-benchmark-results.json");
    writeFileSync(outputPath, JSON.stringify(report, null, 2));

    console.log("\n=== Retrieval Benchmark Results ===");
    console.log(JSON.stringify(report, null, 2));

    expect(Object.keys(report).length).toBeGreaterThan(0);
  });
});
