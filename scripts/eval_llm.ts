#!/usr/bin/env tsx
/**
 * LLM evaluation runner.
 *
 * Requires:
 *   ENABLE_LLM_EVALS=true
 *   DEEPSEEK_API_KEY=...
 *
 * Optional:
 *   DEEPSEEK_BASE_URL (default: https://api.deepseek.com)
 *   DEEPSEEK_MODEL    (default: deepseek-chat)
 *
 * Usage:
 *   pnpm eval:llm
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ClassifyResult } from "../src/schemas/classify.js";
import { MemoryExtractionResult } from "../src/schemas/memory.js";
import { DeepSeekClient, llmJson } from "../src/llm/index.js";
import type { LLMJsonResponse } from "../src/llm/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Pre-flight checks ──────────────────────────────────────────────

if (process.env.ENABLE_LLM_EVALS !== "true") {
  console.log("Skipping LLM evals (set ENABLE_LLM_EVALS=true to run)");
  process.exit(0);
}

if (!process.env.DEEPSEEK_API_KEY) {
  console.error("DEEPSEEK_API_KEY is required for LLM evals");
  process.exit(1);
}

const DEEPSEEK_COST_PER_1K_INPUT = 0.00014;   // $0.14/M input tokens
const DEEPSEEK_COST_PER_1K_OUTPUT = 0.00028;  // $0.28/M output tokens

// ── Types ───────────────────────────────────────────────────────────

interface ClassifierFixture {
  prompt: string;
  expected: {
    intent: "ask" | "do";
    task_type: string;
    risk_range: [number, number];
    complexity_range: [number, number];
  };
}

interface ExtractionFixture {
  text: string;
  expected_min_candidates: number;
  expected_keywords: string[];
  expected_min_confidence: number;
}

interface EvalResult {
  fixture_index: number;
  passed: boolean;
  failures: string[];
  latency_ms: number;
  retries: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  schema_valid: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function formatMs(ms: number): string {
  return `${Math.round(ms)}ms`;
}

// ── Classifier eval ─────────────────────────────────────────────────

async function evalClassifier(): Promise<{
  results: EvalResult[];
  summary: Record<string, unknown>;
}> {
  const fixturePath = path.join(__dirname, "..", "tests", "evals", "classifier.fixtures.json");
  const fixtures: ClassifierFixture[] = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
  const client = new DeepSeekClient();
  const results: EvalResult[] = [];

  console.log(`\n=== Classifier Eval (${fixtures.length} fixtures) ===\n`);

  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    const start = performance.now();

    const response: LLMJsonResponse<typeof ClassifyResult._type> = await llmJson(
      client,
      ClassifyResult,
      [
        {
          role: "system",
          content: `You are a task classifier for a software development agent platform.
Given a user prompt, classify it into a structured result.

Return valid JSON matching this schema:
{
  "intent": "ask" or "do",
  "task_type": one of "answer", "code_edit", "debug", "test_fix", "architecture", "provider_setup", "deploy", "payment_sensitive",
  "complexity_score": 1-100 integer,
  "risk_score": 1-100 integer,
  "ambiguity_score": 1-100 integer,
  "estimated_steps": positive integer,
  "requires_approval": string array of approval types needed,
  "suggested_sequence": string array of recommended action names,
  "reasoning": brief explanation of classification
}`,
        },
        { role: "user", content: fixture.prompt },
      ],
    );

    const latency_ms = performance.now() - start;
    const failures: string[] = [];

    if (!response.success) {
      results.push({
        fixture_index: i,
        passed: false,
        failures: [`LLM error: ${response.error}`],
        latency_ms,
        retries: response.retries,
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0,
        schema_valid: false,
      });
      console.log(`  [${i}] FAIL (${response.error_type}): ${fixture.prompt.slice(0, 50)}...`);
      continue;
    }

    const data = response.data;

    // Check intent
    if (data.intent !== fixture.expected.intent) {
      failures.push(`intent: got "${data.intent}", expected "${fixture.expected.intent}"`);
    }

    // Check task_type
    if (data.task_type !== fixture.expected.task_type) {
      failures.push(`task_type: got "${data.task_type}", expected "${fixture.expected.task_type}"`);
    }

    // Check risk_score range
    const [riskLow, riskHigh] = fixture.expected.risk_range;
    if (data.risk_score < riskLow || data.risk_score > riskHigh) {
      failures.push(
        `risk_score: got ${data.risk_score}, expected [${riskLow}-${riskHigh}]`,
      );
    }

    // Check complexity_score range
    const [compLow, compHigh] = fixture.expected.complexity_range;
    if (data.complexity_score < compLow || data.complexity_score > compHigh) {
      failures.push(
        `complexity_score: got ${data.complexity_score}, expected [${compLow}-${compHigh}]`,
      );
    }

    const tokens_in = response.usage?.prompt_tokens ?? 0;
    const tokens_out = response.usage?.completion_tokens ?? 0;
    const cost_usd =
      (tokens_in / 1000) * DEEPSEEK_COST_PER_1K_INPUT +
      (tokens_out / 1000) * DEEPSEEK_COST_PER_1K_OUTPUT;

    const passed = failures.length === 0;
    results.push({
      fixture_index: i,
      passed,
      failures,
      latency_ms,
      retries: response.retries,
      tokens_in,
      tokens_out,
      cost_usd,
      schema_valid: true,
    });

    const status = passed ? "PASS" : "FAIL";
    console.log(
      `  [${i}] ${status} ${formatMs(latency_ms)} | ${fixture.prompt.slice(0, 50)}... → ${data.task_type}`,
    );
    if (!passed) {
      for (const f of failures) console.log(`       ${f}`);
    }
  }

  const latencies = results.map((r) => r.latency_ms);
  const passCount = results.filter((r) => r.passed).length;
  const schemaFailures = results.filter((r) => !r.schema_valid).length;
  const totalTokensIn = results.reduce((s, r) => s + r.tokens_in, 0);
  const totalTokensOut = results.reduce((s, r) => s + r.tokens_out, 0);
  const totalCost = results.reduce((s, r) => s + r.cost_usd, 0);

  const summary = {
    total: fixtures.length,
    passed: passCount,
    failed: fixtures.length - passCount,
    accuracy: `${((passCount / fixtures.length) * 100).toFixed(1)}%`,
    schema_failure_rate: `${((schemaFailures / fixtures.length) * 100).toFixed(1)}%`,
    latency_p50: formatMs(percentile(latencies, 50)),
    latency_p95: formatMs(percentile(latencies, 95)),
    total_tokens_in: totalTokensIn,
    total_tokens_out: totalTokensOut,
    estimated_cost_usd: `$${totalCost.toFixed(4)}`,
  };

  return { results, summary };
}

// ── Memory extraction eval ──────────────────────────────────────────

async function evalMemoryExtraction(): Promise<{
  results: EvalResult[];
  summary: Record<string, unknown>;
}> {
  const fixturePath = path.join(
    __dirname,
    "..",
    "tests",
    "evals",
    "memory-extraction.fixtures.json",
  );
  const fixtures: ExtractionFixture[] = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
  const client = new DeepSeekClient();
  const results: EvalResult[] = [];

  console.log(`\n=== Memory Extraction Eval (${fixtures.length} fixtures) ===\n`);

  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    const start = performance.now();

    const response: LLMJsonResponse<typeof MemoryExtractionResult._type> = await llmJson(
      client,
      MemoryExtractionResult,
      [
        {
          role: "system",
          content: `You are a memory extraction system for a software development agent platform.
Given text from a coding session, extract durable facts, conventions, patterns, and lessons worth remembering.

Return valid JSON matching this schema:
{
  "candidates": [
    {
      "content": "The extracted fact or convention",
      "confidence": 0.0-1.0 float indicating relevance/importance,
      "scope": optional, one of "user", "repo", "branch", "task", "session", "executor", "global_policy"
    }
  ]
}

Return at most 10 candidates sorted by confidence descending.
Skip trivial or ephemeral facts.`,
        },
        { role: "user", content: fixture.text },
      ],
    );

    const latency_ms = performance.now() - start;
    const failures: string[] = [];

    if (!response.success) {
      results.push({
        fixture_index: i,
        passed: false,
        failures: [`LLM error: ${response.error}`],
        latency_ms,
        retries: response.retries,
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0,
        schema_valid: false,
      });
      console.log(`  [${i}] FAIL (${response.error_type}): ${fixture.text.slice(0, 50)}...`);
      continue;
    }

    const data = response.data;

    // Check minimum candidates
    if (data.candidates.length < fixture.expected_min_candidates) {
      failures.push(
        `candidates: got ${data.candidates.length}, expected >= ${fixture.expected_min_candidates}`,
      );
    }

    // Check keyword coverage
    if (fixture.expected_keywords.length > 0) {
      const allContent = data.candidates.map((c) => c.content.toLowerCase()).join(" ");
      const missingKeywords = fixture.expected_keywords.filter(
        (kw) => !allContent.includes(kw.toLowerCase()),
      );
      if (missingKeywords.length > 0) {
        failures.push(`missing keywords: ${missingKeywords.join(", ")}`);
      }
    }

    // Check minimum confidence
    if (data.candidates.length > 0) {
      const maxConf = Math.max(...data.candidates.map((c) => c.confidence));
      if (maxConf < fixture.expected_min_confidence) {
        failures.push(
          `max confidence: got ${maxConf.toFixed(2)}, expected >= ${fixture.expected_min_confidence}`,
        );
      }
    }

    const tokens_in = response.usage?.prompt_tokens ?? 0;
    const tokens_out = response.usage?.completion_tokens ?? 0;
    const cost_usd =
      (tokens_in / 1000) * DEEPSEEK_COST_PER_1K_INPUT +
      (tokens_out / 1000) * DEEPSEEK_COST_PER_1K_OUTPUT;

    const passed = failures.length === 0;
    results.push({
      fixture_index: i,
      passed,
      failures,
      latency_ms,
      retries: response.retries,
      tokens_in,
      tokens_out,
      cost_usd,
      schema_valid: true,
    });

    const status = passed ? "PASS" : "FAIL";
    console.log(
      `  [${i}] ${status} ${formatMs(latency_ms)} | ${data.candidates.length} candidates | ${fixture.text.slice(0, 50)}...`,
    );
    if (!passed) {
      for (const f of failures) console.log(`       ${f}`);
    }
  }

  const latencies = results.map((r) => r.latency_ms);
  const passCount = results.filter((r) => r.passed).length;
  const schemaFailures = results.filter((r) => !r.schema_valid).length;
  const totalTokensIn = results.reduce((s, r) => s + r.tokens_in, 0);
  const totalTokensOut = results.reduce((s, r) => s + r.tokens_out, 0);
  const totalCost = results.reduce((s, r) => s + r.cost_usd, 0);

  const summary = {
    total: fixtures.length,
    passed: passCount,
    failed: fixtures.length - passCount,
    accuracy: `${((passCount / fixtures.length) * 100).toFixed(1)}%`,
    schema_failure_rate: `${((schemaFailures / fixtures.length) * 100).toFixed(1)}%`,
    latency_p50: formatMs(percentile(latencies, 50)),
    latency_p95: formatMs(percentile(latencies, 95)),
    total_tokens_in: totalTokensIn,
    total_tokens_out: totalTokensOut,
    estimated_cost_usd: `$${totalCost.toFixed(4)}`,
  };

  return { results, summary };
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log("LLM Eval Runner");
  console.log(`Provider: DeepSeek (${process.env.DEEPSEEK_MODEL ?? "deepseek-chat"})`);
  console.log(`Base URL: ${process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com"}`);

  const classifierResult = await evalClassifier();
  const extractionResult = await evalMemoryExtraction();

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));

  console.log("\nClassifier:");
  for (const [k, v] of Object.entries(classifierResult.summary)) {
    console.log(`  ${k}: ${v}`);
  }

  console.log("\nMemory Extraction:");
  for (const [k, v] of Object.entries(extractionResult.summary)) {
    console.log(`  ${k}: ${v}`);
  }

  const allPassed =
    classifierResult.results.every((r) => r.passed) &&
    extractionResult.results.every((r) => r.passed);

  const totalCost =
    classifierResult.results.reduce((s, r) => s + r.cost_usd, 0) +
    extractionResult.results.reduce((s, r) => s + r.cost_usd, 0);

  console.log(`\nOverall: ${allPassed ? "PASS" : "FAIL"}`);
  console.log(`Total estimated cost: $${totalCost.toFixed(4)}`);
  console.log();

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Eval runner failed:", err);
  process.exit(1);
});
