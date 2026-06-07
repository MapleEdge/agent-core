/**
 * Retrieval Benchmark Script
 *
 * Runs the retrieval parity + performance test suite and produces
 * a structured report.
 *
 * Usage: npx tsx scripts/retrieval-benchmark.ts
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

console.log("=== Retrieval Benchmark Report ===\n");

// Run retrieval tests
try {
  const output = execSync("npx vitest run tests/retrieval/ 2>&1", {
    cwd: process.cwd(),
    timeout: 300_000,
    encoding: "utf-8",
  });

  // Extract metrics from stdout
  const metricsMatch = output.match(/=== Retrieval Metrics ===([\s\S]*?)(?:===|$)/);
  if (metricsMatch) {
    console.log("Retrieval Quality Metrics:");
    console.log(metricsMatch[1].trim());
    console.log();
  }

  // Check pass/fail
  const passMatch = output.match(/(\d+) passed/);
  const failMatch = output.match(/(\d+) failed/);
  const passed = passMatch ? parseInt(passMatch[1]) : 0;
  const failed = failMatch ? parseInt(failMatch[1]) : 0;

  console.log(`Tests: ${passed} passed, ${failed} failed\n`);

  // Load benchmark results if available
  const benchPath = join(process.cwd(), "retrieval-benchmark-results.json");
  if (existsSync(benchPath)) {
    const benchData = JSON.parse(readFileSync(benchPath, "utf-8")) as Record<
      string,
      { p50: number; p95: number; p99: number; corpus: number }
    >;

    console.log("Performance Benchmarks:");
    for (const [key, val] of Object.entries(benchData)) {
      console.log(`  ${key}: p50=${val.p50}ms p95=${val.p95}ms p99=${val.p99}ms`);
    }
    console.log();
  }

  // Write combined report
  const report = {
    timestamp: new Date().toISOString(),
    quality: {} as Record<string, number>,
    performance: {} as Record<string, unknown>,
    tests: { passed, failed },
    overall: failed === 0 ? "PASS" : "FAIL",
  };

  // Parse quality metrics
  if (metricsMatch) {
    for (const line of metricsMatch[1].trim().split("\n")) {
      const match = line.match(/^([\w@]+):\s+([\d.]+)/);
      if (match) {
        report.quality[match[1]] = parseFloat(match[2]);
      }
    }
  }

  const benchPath2 = join(process.cwd(), "retrieval-benchmark-results.json");
  if (existsSync(benchPath2)) {
    report.performance = JSON.parse(readFileSync(benchPath2, "utf-8"));
  }

  const reportPath = join(process.cwd(), "retrieval-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report written to: ${reportPath}`);

  process.exit(failed === 0 ? 0 : 1);
} catch (err) {
  console.error("Retrieval benchmark failed:");
  console.error((err as { stdout?: string }).stdout?.slice(-1000) ?? String(err));
  process.exit(1);
}
