/**
 * BEAM pipeline validation — synthetic fixtures shaped like BEAM.
 *
 * CLASSIFICATION: Tier 1 (pipeline validation), NOT Tier 3 (external parity).
 *
 * IMPORTANT: Despite the names "BEAM-1M" and "BEAM-10M", these tests do NOT
 * load 1 million or 10 million memories. They use 10 and 8 hand-written questions
 * respectively, each with ~5 context entries. The names refer to the TARGET
 * benchmark tier, not the actual dataset size.
 *
 * Uses MockMemoryProvider (FTS5) + mock LLM. Does NOT use real embeddings.
 * What this tests: FTS retrieval pipeline + answer eval for BEAM-shaped questions.
 * What this does NOT test: scale retrieval, needle-in-haystack at 1M+ memories.
 */

import { describe, it, expect } from "vitest";
import { runBenchmark } from "./benchmarkHarness.js";
import beamFixtures from "./fixtures/beam.json";
import type { BenchmarkSuite, BenchmarkTargets } from "../../src/memory/capabilities/benchmarkTypes.js";

// BEAM has two question sets — construct two suites
const beam1mSuite: BenchmarkSuite = {
  name: "BEAM-1M",
  version: beamFixtures.version,
  description: `${beamFixtures.description} (1M token tier)`,
  questions: (beamFixtures as Record<string, unknown>).questions_1m as BenchmarkSuite["questions"],
  target_metrics: (beamFixtures as Record<string, unknown>).target_metrics_1m as BenchmarkTargets,
};

const beam10mSuite: BenchmarkSuite = {
  name: "BEAM-10M",
  version: beamFixtures.version,
  description: `${beamFixtures.description} (10M token tier)`,
  questions: (beamFixtures as Record<string, unknown>).questions_10m as BenchmarkSuite["questions"],
  target_metrics: (beamFixtures as Record<string, unknown>).target_metrics_10m as BenchmarkTargets,
};

describe("BEAM-1M Benchmark", () => {
  it("should achieve accuracy target >= 64.1%", async () => {
    const report = await runBenchmark(beam1mSuite);
    console.log(
      `BEAM-1M accuracy: ${report.accuracy.toFixed(1)}% (target: ${beam1mSuite.target_metrics.accuracy}%)`,
    );
    console.log(`  by category:`, report.accuracy_by_category);
    expect(report.accuracy).toBeGreaterThanOrEqual(beam1mSuite.target_metrics.accuracy);
  }, 30000);

  it("should meet latency target p50 <= 1000ms", async () => {
    const report = await runBenchmark(beam1mSuite);
    console.log(`BEAM-1M latency p50: ${report.latency_p50_ms.toFixed(0)}ms (target: ${beam1mSuite.target_metrics.latency_p50_ms}ms)`);
    expect(report.latency_p50_ms).toBeLessThanOrEqual(beam1mSuite.target_metrics.latency_p50_ms!);
  }, 30000);

  it("should stay within token budget (~6.7K mean)", async () => {
    const report = await runBenchmark(beam1mSuite);
    console.log(`BEAM-1M mean tokens/question: ${report.mean_tokens_per_question.toFixed(0)} (budget: ${beam1mSuite.target_metrics.tokens_budget})`);
    expect(report.mean_tokens_per_question).toBeLessThanOrEqual(beam1mSuite.target_metrics.tokens_budget!);
  }, 30000);

  it("should handle exact retrieval questions", async () => {
    const report = await runBenchmark(beam1mSuite);
    const exact = report.results.filter((r) => r.category === "exact-retrieval");
    const correct = exact.filter((r) => r.correct).length;
    const acc = (correct / exact.length) * 100;
    console.log(`BEAM-1M exact-retrieval: ${acc.toFixed(1)}% (${correct}/${exact.length})`);
    expect(acc).toBeGreaterThanOrEqual(60);
  }, 30000);

  it("should handle semantic retrieval questions", async () => {
    const report = await runBenchmark(beam1mSuite);
    const semantic = report.results.filter((r) => r.category === "semantic-retrieval");
    const correct = semantic.filter((r) => r.correct).length;
    const acc = (correct / semantic.length) * 100;
    console.log(`BEAM-1M semantic-retrieval: ${acc.toFixed(1)}% (${correct}/${semantic.length})`);
    expect(acc).toBeGreaterThanOrEqual(50);
  }, 30000);

  it("should handle associative reasoning questions", async () => {
    const report = await runBenchmark(beam1mSuite);
    const assoc = report.results.filter((r) => r.category === "associative");
    const correct = assoc.filter((r) => r.correct).length;
    const acc = (correct / assoc.length) * 100;
    console.log(`BEAM-1M associative: ${acc.toFixed(1)}% (${correct}/${assoc.length})`);
    expect(acc).toBeGreaterThanOrEqual(50);
  }, 30000);

  it("should produce a valid benchmark report", async () => {
    const report = await runBenchmark(beam1mSuite);
    expect(report.suite).toBe("BEAM-1M");
    expect(report.results.length).toBe(beam1mSuite.questions.length);
    expect(typeof report.passed).toBe("boolean");
  }, 30000);
});

describe("BEAM-10M Benchmark", () => {
  it("should achieve accuracy target >= 48.6%", async () => {
    const report = await runBenchmark(beam10mSuite);
    console.log(
      `BEAM-10M accuracy: ${report.accuracy.toFixed(1)}% (target: ${beam10mSuite.target_metrics.accuracy}%)`,
    );
    console.log(`  by category:`, report.accuracy_by_category);
    expect(report.accuracy).toBeGreaterThanOrEqual(beam10mSuite.target_metrics.accuracy);
  }, 30000);

  it("should meet latency target p50 <= 1050ms", async () => {
    const report = await runBenchmark(beam10mSuite);
    console.log(`BEAM-10M latency p50: ${report.latency_p50_ms.toFixed(0)}ms (target: ${beam10mSuite.target_metrics.latency_p50_ms}ms)`);
    expect(report.latency_p50_ms).toBeLessThanOrEqual(beam10mSuite.target_metrics.latency_p50_ms!);
  }, 30000);

  it("should stay within token budget (~6.9K mean)", async () => {
    const report = await runBenchmark(beam10mSuite);
    console.log(`BEAM-10M mean tokens/question: ${report.mean_tokens_per_question.toFixed(0)} (budget: ${beam10mSuite.target_metrics.tokens_budget})`);
    expect(report.mean_tokens_per_question).toBeLessThanOrEqual(beam10mSuite.target_metrics.tokens_budget!);
  }, 30000);

  it("should handle needle-in-haystack questions", async () => {
    const report = await runBenchmark(beam10mSuite);
    const needle = report.results.filter((r) => r.category === "needle-in-haystack");
    const correct = needle.filter((r) => r.correct).length;
    const acc = (correct / needle.length) * 100;
    console.log(`BEAM-10M needle-in-haystack: ${acc.toFixed(1)}% (${correct}/${needle.length})`);
    expect(acc).toBeGreaterThanOrEqual(40);
  }, 30000);

  it("should handle cross-document reasoning questions", async () => {
    const report = await runBenchmark(beam10mSuite);
    const cross = report.results.filter((r) => r.category === "cross-document");
    const correct = cross.filter((r) => r.correct).length;
    const acc = (correct / cross.length) * 100;
    console.log(`BEAM-10M cross-document: ${acc.toFixed(1)}% (${correct}/${cross.length})`);
    expect(acc).toBeGreaterThanOrEqual(40);
  }, 30000);

  it("should produce a valid benchmark report", async () => {
    const report = await runBenchmark(beam10mSuite);
    expect(report.suite).toBe("BEAM-10M");
    expect(report.results.length).toBe(beam10mSuite.questions.length);
    expect(typeof report.passed).toBe("boolean");
  }, 30000);
});
