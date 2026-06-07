#!/usr/bin/env tsx
/**
 * Benchmark runner — runs all Tier 1 pipeline validation suites.
 *
 * IMPORTANT: These are pipeline validation tests using synthetic fixtures
 * and a mock LLM. Accuracy numbers reflect FTS retrieval + token-overlap
 * evaluation, NOT real LLM reasoning or external benchmark parity.
 * See docs/benchmarks/benchmark-methodology.md.
 *
 * Usage:
 *   pnpm bench               # run all benchmarks
 *   pnpm bench -- --suite locomo    # run specific suite
 *   pnpm bench -- --json           # JSON-only output
 */

import { runBenchmark } from "../tests/benchmarks/benchmarkHarness.js";
import locomoFixtures from "../tests/benchmarks/fixtures/locomo.json";
import longMemEvalFixtures from "../tests/benchmarks/fixtures/longmemeval.json";
import beamFixtures from "../tests/benchmarks/fixtures/beam.json";
import type { BenchmarkSuite, BenchmarkReport, BenchmarkTargets } from "../src/memory/capabilities/benchmarkTypes.js";
import { writeFileSync } from "fs";
import { join } from "path";

const suites: Record<string, BenchmarkSuite> = {
  locomo: locomoFixtures as unknown as BenchmarkSuite,
  longmemeval: longMemEvalFixtures as unknown as BenchmarkSuite,
  "beam-1m": {
    name: "BEAM-1M",
    version: beamFixtures.version,
    description: `${beamFixtures.description} (1M token tier)`,
    questions: (beamFixtures as Record<string, unknown>).questions_1m as BenchmarkSuite["questions"],
    target_metrics: (beamFixtures as Record<string, unknown>).target_metrics_1m as BenchmarkTargets,
  },
  "beam-10m": {
    name: "BEAM-10M",
    version: beamFixtures.version,
    description: `${beamFixtures.description} (10M token tier)`,
    questions: (beamFixtures as Record<string, unknown>).questions_10m as BenchmarkSuite["questions"],
    target_metrics: (beamFixtures as Record<string, unknown>).target_metrics_10m as BenchmarkTargets,
  },
};

interface AllResults {
  timestamp: string;
  reports: Record<string, BenchmarkReport>;
  summary: {
    all_passed: boolean;
    suites_passed: number;
    suites_total: number;
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const jsonOnly = args.includes("--json");
  const suiteFilter = args.find((a) => !a.startsWith("--"));

  const suitesToRun = suiteFilter
    ? { [suiteFilter]: suites[suiteFilter] }
    : suites;

  if (suiteFilter && !suites[suiteFilter]) {
    console.error(`Unknown suite: ${suiteFilter}. Available: ${Object.keys(suites).join(", ")}`);
    process.exit(1);
  }

  const reports: Record<string, BenchmarkReport> = {};
  let passed = 0;
  let total = 0;

  for (const [name, suite] of Object.entries(suitesToRun)) {
    if (!jsonOnly) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`Running ${suite.name}...`);
      console.log(`${"=".repeat(60)}`);
    }

    const report = await runBenchmark(suite);
    reports[name] = report;
    total++;
    if (report.passed) passed++;

    if (!jsonOnly) {
      printReport(report);
    }
  }

  const allResults: AllResults = {
    timestamp: new Date().toISOString(),
    reports,
    summary: {
      all_passed: passed === total,
      suites_passed: passed,
      suites_total: total,
    },
  };

  // Write JSON output to both root and docs/benchmarks/raw/
  const outPath = join(process.cwd(), "benchmark-results.json");
  const rawDir = join(process.cwd(), "docs", "benchmarks", "raw");
  writeFileSync(outPath, JSON.stringify(allResults, null, 2));
  try {
    const { mkdirSync } = await import("fs");
    mkdirSync(rawDir, { recursive: true });
    writeFileSync(join(rawDir, "pipeline-validation-results.json"), JSON.stringify(allResults, null, 2));
  } catch {
    // raw dir write is best-effort
  }

  if (jsonOnly) {
    console.log(JSON.stringify(allResults, null, 2));
  } else {
    console.log(`\n${"=".repeat(60)}`);
    console.log("SUMMARY");
    console.log(`${"=".repeat(60)}`);
    for (const [name, report] of Object.entries(reports)) {
      const status = report.passed ? "PASS" : "FAIL";
      console.log(
        `  ${name.padEnd(15)} ${status.padEnd(6)} accuracy=${report.accuracy.toFixed(1)}% (target ${report.targets.accuracy}%)  p50=${report.latency_p50_ms.toFixed(0)}ms`,
      );
    }
    console.log(`\n  Result: ${passed}/${total} suites passed`);
    console.log(`  JSON written to: ${outPath}`);
  }

  process.exit(passed === total ? 0 : 1);
}

function printReport(report: BenchmarkReport): void {
  console.log(`\n  Suite: ${report.suite}`);
  console.log(`  Status: ${report.passed ? "PASS" : "FAIL"}`);
  console.log(`  Accuracy: ${report.accuracy.toFixed(1)}% (target: ${report.targets.accuracy}%)`);
  console.log(`  Abstention rate: ${report.abstention_rate.toFixed(1)}%`);
  console.log(`  Mean confidence: ${report.mean_confidence.toFixed(3)}`);
  console.log(`  Tokens: ${report.total_tokens} total, ${report.mean_tokens_per_question.toFixed(0)}/question`);
  console.log(`  Latency: p50=${report.latency_p50_ms.toFixed(0)}ms p95=${report.latency_p95_ms.toFixed(0)}ms p99=${report.latency_p99_ms.toFixed(0)}ms`);

  console.log(`  By category:`);
  for (const [cat, acc] of Object.entries(report.accuracy_by_category)) {
    console.log(`    ${cat.padEnd(25)} ${acc.toFixed(1)}%`);
  }

  // Show failed questions
  const failed = report.results.filter((r) => !r.correct);
  if (failed.length > 0) {
    console.log(`  Failed questions (${failed.length}):`);
    for (const f of failed) {
      console.log(`    ${f.id}: "${f.question.slice(0, 60)}..."`);
      console.log(`      gold: "${f.gold_answer.slice(0, 80)}"`);
      console.log(`      pred: "${f.predicted_answer.slice(0, 80)}"`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
