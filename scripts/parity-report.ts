/**
 * Parity Report Generator
 *
 * Runs the full parity + performance suite and produces a structured
 * report for CI consumption.
 *
 * Usage: npx tsx scripts/parity-report.ts
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface CategoryResult {
  name: string;
  status: "PASS" | "FAIL" | "SKIP";
  tests: number;
  failures: number;
  details?: string;
}

const categories: CategoryResult[] = [];

function runTestFile(pattern: string, name: string): CategoryResult {
  try {
    const output = execSync(
      `npx vitest run --reporter=json ${pattern} 2>&1`,
      { cwd: process.cwd(), timeout: 120_000, encoding: "utf-8" },
    );

    // Extract test counts from JSON reporter output
    const jsonMatch = output.match(/\{[\s\S]*"testResults"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const results = parsed.testResults ?? [];
      let total = 0;
      let failed = 0;
      for (const r of results) {
        for (const t of r.assertionResults ?? []) {
          total++;
          if (t.status === "failed") failed++;
        }
      }
      return {
        name,
        status: failed === 0 ? "PASS" : "FAIL",
        tests: total,
        failures: failed,
      };
    }

    // Fallback: parse plain output
    const passMatch = output.match(/(\d+) passed/);
    const failMatch = output.match(/(\d+) failed/);
    const passed = passMatch ? parseInt(passMatch[1]) : 0;
    const failures = failMatch ? parseInt(failMatch[1]) : 0;

    return {
      name,
      status: failures === 0 ? "PASS" : "FAIL",
      tests: passed + failures,
      failures,
    };
  } catch (err) {
    const output = (err as { stdout?: string }).stdout ?? "";
    const failMatch = output.match(/(\d+) failed/);
    const passMatch = output.match(/(\d+) passed/);
    const failures = failMatch ? parseInt(failMatch[1]) : 1;
    const passed = passMatch ? parseInt(passMatch[1]) : 0;

    return {
      name,
      status: "FAIL",
      tests: passed + failures,
      failures,
      details: output.slice(-500),
    };
  }
}

console.log("=== Action Subsystem Parity Report ===\n");

// Run each category
const testSuites: Array<{ pattern: string; name: string }> = [
  { pattern: "tests/parity/schema-validation", name: "Schema Validation" },
  { pattern: "tests/parity/permission-boundary", name: "Permission Enforcement" },
  { pattern: "tests/parity/audit-completeness", name: "Audit Completeness" },
  { pattern: "tests/parity/timeline-integrity", name: "Timeline Integrity" },
  { pattern: "tests/parity/rationale-safety", name: "Rationale Safety" },
  { pattern: "tests/parity/fault-injection", name: "Fault Injection" },
  { pattern: "tests/parity/mutation", name: "Mutation Coverage" },
  { pattern: "tests/performance/concurrency", name: "Concurrency" },
  { pattern: "tests/performance/benchmarks", name: "Performance Targets" },
];

for (const suite of testSuites) {
  console.log(`Running: ${suite.name}...`);
  const result = runTestFile(suite.pattern, suite.name);
  categories.push(result);
  console.log(`  ${result.status}  (${result.tests} tests, ${result.failures} failures)\n`);
}

// Print summary
console.log("\n=== Summary ===\n");
for (const cat of categories) {
  const icon = cat.status === "PASS" ? "PASS" : "FAIL";
  console.log(`${cat.name}\n  ${icon}\n`);
}

const allPassed = categories.every((c) => c.status === "PASS");
console.log(`\nOverall: ${allPassed ? "ALL PASSED" : "SOME FAILED"}`);

// Load benchmark results if available
const benchPath = join(process.cwd(), "benchmark-results.json");
let benchmarkData: Record<string, unknown> = {};
if (existsSync(benchPath)) {
  benchmarkData = JSON.parse(readFileSync(benchPath, "utf-8"));
}

// Write JSON report
const report = {
  timestamp: new Date().toISOString(),
  overall: allPassed ? "PASS" : "FAIL",
  categories: categories.map((c) => ({
    name: c.name,
    status: c.status,
    tests: c.tests,
    failures: c.failures,
  })),
  benchmarks: benchmarkData,
};

const reportPath = join(process.cwd(), "parity-report.json");
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\nReport written to: ${reportPath}`);

process.exit(allPassed ? 0 : 1);
