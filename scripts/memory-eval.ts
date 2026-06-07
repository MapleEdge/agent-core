/**
 * Memory Quality Evaluation Harness
 *
 * Benchmarks memory providers against golden retrieval fixtures.
 * Produces machine-readable JSON with Recall@1/3/5, MRR, nDCG metrics.
 *
 * Usage:
 *   pnpm memory:eval              — benchmark the default provider (mock)
 *   MEMORY_PROVIDER=mem0 pnpm memory:eval  — benchmark mem0 (requires MEM0_BASE_URL)
 *
 * Output: JSON report to stdout, human-readable summary to stderr.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Dynamically import to ensure the DB is set up first
process.env.AGENT_CORE_DB = ":memory:";

interface Fixture {
  corpus_content: string;
  corpus_metadata: Record<string, unknown>;
  query: string;
  expected_match: boolean;
}

interface Category {
  description: string;
  fixtures: Fixture[];
}

interface BenchmarkFixtures {
  categories: Record<string, Category>;
}

interface MetricsReport {
  provider: string;
  recallAt1: number;
  recallAt3: number;
  recallAt5: number;
  mrr: number;
  ndcg5: number;
  totalFixtures: number;
  categories: Record<string, { recallAt1: number; mrr: number }>;
  latency: { writeP50: number; writeP95: number; searchP50: number; searchP95: number };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, idx)];
}

function dcg(relevances: number[], k: number): number {
  let sum = 0;
  for (let i = 0; i < Math.min(relevances.length, k); i++) {
    sum += relevances[i] / Math.log2(i + 2);
  }
  return sum;
}

async function main() {
  // Import after env setup
  const { getDb, closeDb } = await import("../src/db.js");
  const { registerDefaultProviders } = await import("../src/providers/defaults.js");
  const { getProvider } = await import("../src/providers/registry.js");

  getDb();
  registerDefaultProviders();

  const memoryProvider = getProvider("memory");
  const providerName = memoryProvider.name;

  console.error(`\n=== Memory Quality Evaluation ===`);
  console.error(`Provider: ${providerName}`);
  console.error(`Status: ${memoryProvider.status}\n`);

  const fixturesPath = resolve(import.meta.dirname ?? ".", "../tests/fixtures/memory-retrieval-benchmarks.json");
  const fixtures: BenchmarkFixtures = JSON.parse(readFileSync(fixturesPath, "utf-8"));

  // Seed corpus
  const writeTimes: number[] = [];
  const corpusMap = new Map<string, string>(); // content -> memoryId

  for (const [, category] of Object.entries(fixtures.categories)) {
    for (const fixture of category.fixtures) {
      const start = performance.now();
      const record = await memoryProvider.write({
        scope: fixture.corpus_metadata.scope as string ?? "repo",
        scope_id: fixture.corpus_metadata.scope_id as string ?? "benchmark",
        content: fixture.corpus_content,
      });
      writeTimes.push(performance.now() - start);
      corpusMap.set(fixture.corpus_content, record.id);
    }
  }

  // Run queries and measure
  const searchTimes: number[] = [];
  const categoryMetrics: Record<string, { hits1: number; rrs: number[]; total: number }> = {};
  let totalHits1 = 0;
  let totalHits3 = 0;
  let totalHits5 = 0;
  const allRRs: number[] = [];
  const allNDCGs: number[] = [];
  let totalQueries = 0;

  for (const [catName, category] of Object.entries(fixtures.categories)) {
    if (!categoryMetrics[catName]) {
      categoryMetrics[catName] = { hits1: 0, rrs: [], total: 0 };
    }

    for (const fixture of category.fixtures) {
      if (!fixture.expected_match) continue;
      totalQueries++;
      categoryMetrics[catName].total++;

      const start = performance.now();
      const results = await memoryProvider.search({
        query: fixture.query,
        top_k: 5,
      });
      searchTimes.push(performance.now() - start);

      const targetId = corpusMap.get(fixture.corpus_content);
      const resultIds = results.map((r) => r.id);

      // Recall@k
      const idx = resultIds.indexOf(targetId!);
      if (idx >= 0 && idx < 1) { totalHits1++; categoryMetrics[catName].hits1++; }
      if (idx >= 0 && idx < 3) totalHits3++;
      if (idx >= 0 && idx < 5) totalHits5++;

      // MRR
      const rr = idx >= 0 ? 1 / (idx + 1) : 0;
      allRRs.push(rr);
      categoryMetrics[catName].rrs.push(rr);

      // nDCG@5
      const relevances = resultIds.map((id) => (id === targetId ? 1 : 0));
      const idealRelevances = [1, ...new Array(Math.max(0, relevances.length - 1)).fill(0)];
      const ndcgVal = dcg(idealRelevances, 5) > 0 ? dcg(relevances, 5) / dcg(idealRelevances, 5) : 0;
      allNDCGs.push(ndcgVal);
    }
  }

  // Compute metrics
  writeTimes.sort((a, b) => a - b);
  searchTimes.sort((a, b) => a - b);

  const report: MetricsReport = {
    provider: providerName,
    recallAt1: totalQueries > 0 ? totalHits1 / totalQueries : 0,
    recallAt3: totalQueries > 0 ? totalHits3 / totalQueries : 0,
    recallAt5: totalQueries > 0 ? totalHits5 / totalQueries : 0,
    mrr: allRRs.length > 0 ? allRRs.reduce((a, b) => a + b, 0) / allRRs.length : 0,
    ndcg5: allNDCGs.length > 0 ? allNDCGs.reduce((a, b) => a + b, 0) / allNDCGs.length : 0,
    totalFixtures: totalQueries,
    categories: {},
    latency: {
      writeP50: percentile(writeTimes, 0.5),
      writeP95: percentile(writeTimes, 0.95),
      searchP50: percentile(searchTimes, 0.5),
      searchP95: percentile(searchTimes, 0.95),
    },
  };

  for (const [catName, cat] of Object.entries(categoryMetrics)) {
    report.categories[catName] = {
      recallAt1: cat.total > 0 ? cat.hits1 / cat.total : 0,
      mrr: cat.rrs.length > 0 ? cat.rrs.reduce((a, b) => a + b, 0) / cat.rrs.length : 0,
    };
  }

  // Output
  console.log(JSON.stringify(report, null, 2));

  // Human-readable summary
  console.error(`\nResults:`);
  console.error(`  Recall@1: ${report.recallAt1.toFixed(3)}`);
  console.error(`  Recall@3: ${report.recallAt3.toFixed(3)}`);
  console.error(`  Recall@5: ${report.recallAt5.toFixed(3)}`);
  console.error(`  MRR:      ${report.mrr.toFixed(3)}`);
  console.error(`  nDCG@5:   ${report.ndcg5.toFixed(3)}`);
  console.error(`\nLatency:`);
  console.error(`  Write p50: ${report.latency.writeP50.toFixed(2)}ms  p95: ${report.latency.writeP95.toFixed(2)}ms`);
  console.error(`  Search p50: ${report.latency.searchP50.toFixed(2)}ms  p95: ${report.latency.searchP95.toFixed(2)}ms`);
  console.error(`\nPer-category:`);
  for (const [catName, cat] of Object.entries(report.categories)) {
    console.error(`  ${catName}: Recall@1=${cat.recallAt1.toFixed(2)} MRR=${cat.mrr.toFixed(2)}`);
  }

  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
