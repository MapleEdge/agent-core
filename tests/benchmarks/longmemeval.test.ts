/**
 * LongMemEval pipeline validation — synthetic fixtures shaped like LongMemEval.
 *
 * CLASSIFICATION: Tier 1 (pipeline validation), NOT Tier 3 (external parity).
 * Uses 20 hand-written questions + MockMemoryProvider (FTS5) + mock LLM.
 * Does NOT load the real LongMemEval dataset or use a real LLM.
 *
 * What this tests: FTS retrieval → answer generation pipeline → correctness eval.
 * What this does NOT test: semantic retrieval quality, real LLM reasoning, scale.
 */

import { describe, it, expect } from "vitest";
import { runBenchmark } from "./benchmarkHarness.js";
import longMemEvalFixtures from "./fixtures/longmemeval.json";
import type { BenchmarkSuite } from "../../src/memory/capabilities/benchmarkTypes.js";

const suite = longMemEvalFixtures as unknown as BenchmarkSuite;

describe("LongMemEval Benchmark", () => {
  it("should achieve accuracy target >= 94.8%", async () => {
    const report = await runBenchmark(suite);
    console.log(
      `LongMemEval accuracy: ${report.accuracy.toFixed(1)}% (target: ${suite.target_metrics.accuracy}%)`,
    );
    console.log(`  by category:`, report.accuracy_by_category);
    expect(report.accuracy).toBeGreaterThanOrEqual(suite.target_metrics.accuracy);
  }, 30000);

  it("should meet latency target p50 <= 1090ms", async () => {
    const report = await runBenchmark(suite);
    console.log(`LongMemEval latency p50: ${report.latency_p50_ms.toFixed(0)}ms (target: ${suite.target_metrics.latency_p50_ms}ms)`);
    expect(report.latency_p50_ms).toBeLessThanOrEqual(suite.target_metrics.latency_p50_ms!);
  }, 30000);

  it("should stay within token budget (~6.8K mean)", async () => {
    const report = await runBenchmark(suite);
    console.log(`LongMemEval mean tokens/question: ${report.mean_tokens_per_question.toFixed(0)} (budget: ${suite.target_metrics.tokens_budget})`);
    expect(report.mean_tokens_per_question).toBeLessThanOrEqual(suite.target_metrics.tokens_budget!);
  }, 30000);

  it("should correctly handle abstention questions", async () => {
    const report = await runBenchmark(suite);
    const abstention = report.results.filter((r) => r.category === "abstention");
    const correct = abstention.filter((r) => r.correct).length;
    console.log(`LongMemEval abstention: ${correct}/${abstention.length} correct`);
    expect(correct).toBe(abstention.length);
  }, 30000);

  it("should handle information extraction questions", async () => {
    const report = await runBenchmark(suite);
    const ie = report.results.filter((r) => r.category === "information-extraction");
    const correct = ie.filter((r) => r.correct).length;
    const acc = (correct / ie.length) * 100;
    console.log(`LongMemEval information-extraction: ${acc.toFixed(1)}% (${correct}/${ie.length})`);
    expect(acc).toBeGreaterThanOrEqual(85);
  }, 30000);

  it("should handle multi-session reasoning questions", async () => {
    const report = await runBenchmark(suite);
    const ms = report.results.filter((r) => r.category === "multi-session");
    const correct = ms.filter((r) => r.correct).length;
    const acc = (correct / ms.length) * 100;
    console.log(`LongMemEval multi-session: ${acc.toFixed(1)}% (${correct}/${ms.length})`);
    expect(acc).toBeGreaterThanOrEqual(70);
  }, 30000);

  it("should handle knowledge-update detection questions", async () => {
    const report = await runBenchmark(suite);
    const ku = report.results.filter((r) => r.category === "knowledge-update");
    const correct = ku.filter((r) => r.correct).length;
    const acc = (correct / ku.length) * 100;
    console.log(`LongMemEval knowledge-update: ${acc.toFixed(1)}% (${correct}/${ku.length})`);
    expect(acc).toBeGreaterThanOrEqual(80);
  }, 30000);

  it("should produce a valid benchmark report", async () => {
    const report = await runBenchmark(suite);
    expect(report.suite).toBe("LongMemEval");
    expect(report.results.length).toBe(suite.questions.length);
    expect(report.accuracy).toBeGreaterThanOrEqual(0);
    expect(report.accuracy).toBeLessThanOrEqual(100);
    expect(typeof report.passed).toBe("boolean");
  }, 30000);
});
