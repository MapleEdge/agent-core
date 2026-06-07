/**
 * LoCoMo pipeline validation — synthetic fixtures shaped like LoCoMo.
 *
 * CLASSIFICATION: Tier 1 (pipeline validation), NOT Tier 3 (external parity).
 * Uses 27 hand-written questions + MockMemoryProvider (FTS5) + mock LLM.
 * Does NOT load the real LoCoMo dataset or use a real LLM.
 *
 * What this tests: FTS retrieval → answer generation pipeline → correctness eval.
 * What this does NOT test: semantic retrieval quality, real LLM reasoning, scale.
 */

import { describe, it, expect } from "vitest";
import { runBenchmark } from "./benchmarkHarness.js";
import locomoFixtures from "./fixtures/locomo.json";
import type { BenchmarkSuite } from "../../src/memory/capabilities/benchmarkTypes.js";

const suite = locomoFixtures as unknown as BenchmarkSuite;

describe("LoCoMo Benchmark", () => {
  it("should achieve accuracy target >= 91.6%", async () => {
    const report = await runBenchmark(suite);
    console.log(
      `LoCoMo accuracy: ${report.accuracy.toFixed(1)}% (target: ${suite.target_metrics.accuracy}%)`,
    );
    console.log(`  by category:`, report.accuracy_by_category);
    expect(report.accuracy).toBeGreaterThanOrEqual(suite.target_metrics.accuracy);
  }, 30000);

  it("should meet latency target p50 <= 880ms", async () => {
    const report = await runBenchmark(suite);
    console.log(`LoCoMo latency p50: ${report.latency_p50_ms.toFixed(0)}ms (target: ${suite.target_metrics.latency_p50_ms}ms)`);
    expect(report.latency_p50_ms).toBeLessThanOrEqual(suite.target_metrics.latency_p50_ms!);
  }, 30000);

  it("should stay within token budget (~7.0K mean)", async () => {
    const report = await runBenchmark(suite);
    console.log(`LoCoMo mean tokens/question: ${report.mean_tokens_per_question.toFixed(0)} (budget: ${suite.target_metrics.tokens_budget})`);
    expect(report.mean_tokens_per_question).toBeLessThanOrEqual(suite.target_metrics.tokens_budget!);
  }, 30000);

  it("should correctly handle adversarial abstention questions", async () => {
    const report = await runBenchmark(suite);
    const adversarial = report.results.filter((r) => r.category === "adversarial");
    const adversarialCorrect = adversarial.filter((r) => r.correct).length;
    console.log(`LoCoMo adversarial: ${adversarialCorrect}/${adversarial.length} correct`);
    expect(adversarialCorrect).toBe(adversarial.length);
  }, 30000);

  it("should handle single-hop retrieval questions", async () => {
    const report = await runBenchmark(suite);
    const singleHop = report.results.filter((r) => r.category === "single-hop");
    const correct = singleHop.filter((r) => r.correct).length;
    const acc = (correct / singleHop.length) * 100;
    console.log(`LoCoMo single-hop: ${acc.toFixed(1)}% (${correct}/${singleHop.length})`);
    expect(acc).toBeGreaterThanOrEqual(85);
  }, 30000);

  it("should handle multi-hop reasoning questions", async () => {
    const report = await runBenchmark(suite);
    const multiHop = report.results.filter((r) => r.category === "multi-hop");
    const correct = multiHop.filter((r) => r.correct).length;
    const acc = (correct / multiHop.length) * 100;
    console.log(`LoCoMo multi-hop: ${acc.toFixed(1)}% (${correct}/${multiHop.length})`);
    expect(acc).toBeGreaterThanOrEqual(80);
  }, 30000);

  it("should handle temporal reasoning questions", async () => {
    const report = await runBenchmark(suite);
    const temporal = report.results.filter((r) => r.category === "temporal");
    const correct = temporal.filter((r) => r.correct).length;
    const acc = (correct / temporal.length) * 100;
    console.log(`LoCoMo temporal: ${acc.toFixed(1)}% (${correct}/${temporal.length})`);
    expect(acc).toBeGreaterThanOrEqual(75);
  }, 30000);

  it("should produce a valid benchmark report", async () => {
    const report = await runBenchmark(suite);
    expect(report.suite).toBe("LoCoMo");
    expect(report.results.length).toBe(suite.questions.length);
    expect(report.accuracy).toBeGreaterThanOrEqual(0);
    expect(report.accuracy).toBeLessThanOrEqual(100);
    expect(report.latency_p50_ms).toBeGreaterThanOrEqual(0);
    expect(report.total_tokens).toBeGreaterThan(0);
    expect(typeof report.passed).toBe("boolean");
  }, 30000);
});
