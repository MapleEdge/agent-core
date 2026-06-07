/**
 * Adversarial retrieval tests — answers NOT trivially present in context.
 *
 * CLASSIFICATION: Tier 2 (adversarial validation).
 *
 * These tests specifically target failure modes:
 * 1. Distractors that share vocabulary with the question but don't answer it
 * 2. Questions requiring inference across multiple context entries
 * 3. Questions where the gold answer uses different vocabulary than the context
 * 4. Red herring context entries that are topically similar but wrong
 *
 * Expected: accuracy WILL be lower than pipeline validation tests.
 * The goal is to establish honest baselines, not to claim high scores.
 */

import { describe, it, expect } from "vitest";
import { MockMemoryProvider } from "../../src/providers/mocks/MockMemoryProvider.js";

interface AdversarialCase {
  id: string;
  question: string;
  gold_answer: string;
  /** Context entries to ingest (some are distractors) */
  context_entries: string[];
  /** Which context entries are actually relevant (indices) */
  relevant_indices: number[];
  /** Category of adversarial challenge */
  category: "vocabulary-mismatch" | "red-herring" | "inference-required" | "negation" | "partial-match";
}

const ADVERSARIAL_CASES: AdversarialCase[] = [
  // Vocabulary mismatch: question uses different words than context
  {
    id: "adv-vocab-001",
    question: "What tool enforces code style consistency?",
    gold_answer: "ESLint with Prettier",
    context_entries: [
      "The linter configuration extends the recommended ruleset.",
      "Prettier formats code on save in the editor.",
      "ESLint runs in the CI pipeline before tests.",
      "The build process compiles TypeScript to JavaScript.",
      "Docker images are built using multi-stage builds.",
    ],
    relevant_indices: [0, 1, 2],
    category: "vocabulary-mismatch",
  },
  {
    id: "adv-vocab-002",
    question: "How does the system handle concurrent access?",
    gold_answer: "SQLite WAL mode with connection pooling",
    context_entries: [
      "The database uses WAL journal mode for read concurrency.",
      "Connection pooling limits simultaneous database handles to 5.",
      "Memory writes are serialized through a queue.",
      "The HTTP server handles 1000 concurrent connections.",
      "Redis caching reduces database load during peak traffic.",
    ],
    relevant_indices: [0, 1],
    category: "vocabulary-mismatch",
  },

  // Red herring: context entries share keywords but answer different questions
  {
    id: "adv-herring-001",
    question: "What programming language is the API server written in?",
    gold_answer: "TypeScript",
    context_entries: [
      "The Python worker process handles embedding generation.",
      "The mem0 provider is implemented in Python with JSON-RPC transport.",
      "Fastify serves the API endpoints with TypeScript handlers.",
      "The frontend uses JavaScript with React components.",
      "Shell scripts handle deployment and smoke testing.",
    ],
    relevant_indices: [2],
    category: "red-herring",
  },
  {
    id: "adv-herring-002",
    question: "What is the default port for the development server?",
    gold_answer: "3000",
    context_entries: [
      "PostgreSQL runs on port 5432 in the Docker compose setup.",
      "The Redis cache listens on port 6379.",
      "The development server starts on port 3000 by default.",
      "The mem0 REST API binds to port 8080 when running as sidecar.",
      "Prometheus metrics are exposed on port 9090.",
    ],
    relevant_indices: [2],
    category: "red-herring",
  },

  // Inference required: answer must be synthesized from multiple entries
  {
    id: "adv-infer-001",
    question: "What is the complete test execution order in CI?",
    gold_answer: "lint, typecheck, unit tests, integration tests, smoke test",
    context_entries: [
      "The first CI step runs the linter on all source files.",
      "After linting, TypeScript compilation check runs with --noEmit.",
      "Unit tests execute after the typecheck succeeds.",
      "Integration tests run only if unit tests pass.",
      "The final CI step is a smoke test that verifies /health.",
    ],
    relevant_indices: [0, 1, 2, 3, 4],
    category: "inference-required",
  },
  {
    id: "adv-infer-002",
    question: "What happens when an embedding request fails during memory write?",
    gold_answer: "The memory is still persisted via FTS, embedding failure is logged, search falls back to BM25",
    context_entries: [
      "Memory writes always persist to SQLite first before embedding generation.",
      "Embedding generation runs asynchronously after the main write.",
      "Failed embedding requests are logged at WARN level.",
      "Search falls back to BM25 when vector results are unavailable.",
      "The retry policy attempts embedding generation 3 times before giving up.",
    ],
    relevant_indices: [0, 1, 2, 3],
    category: "inference-required",
  },

  // Negation: context says what something is NOT
  {
    id: "adv-neg-001",
    question: "Does the project use MongoDB?",
    gold_answer: "No, the project uses SQLite",
    context_entries: [
      "The project does not use MongoDB or any document database.",
      "All data is stored in SQLite with WAL mode.",
      "MongoDB was considered but rejected for complexity reasons.",
      "The team evaluated Redis, MongoDB, and PostgreSQL before choosing SQLite.",
    ],
    relevant_indices: [0, 1],
    category: "negation",
  },

  // Partial match: context contains partial information that could be misleading
  {
    id: "adv-partial-001",
    question: "What version of Node.js is required?",
    gold_answer: "Node.js 18 or higher",
    context_entries: [
      "The CI runs tests on Node.js 18 and Node.js 20.",
      "The engines field in package.json specifies node >= 18.",
      "Some developers use Node.js 22 locally.",
      "The Dockerfile uses node:20-alpine as the base image.",
      "Bun is not supported as an alternative runtime.",
    ],
    relevant_indices: [0, 1],
    category: "partial-match",
  },
];

async function runAdversarialCase(
  c: AdversarialCase,
): Promise<{ id: string; category: string; retrievedRelevant: boolean; retrievedDistractor: boolean; topResult: string }> {
  const memory = new MockMemoryProvider();
  const scopeId = `adversarial-${c.id}`;

  // Ingest all context
  for (const entry of c.context_entries) {
    await memory.write({
      scope: "session",
      scope_id: scopeId,
      content: entry,
      kind: "observation",
      metadata: { case_id: c.id },
    });
  }

  // Search using the question
  const results = await memory.search({
    query: c.question,
    top_k: 3,
    scope: "session",
    scope_id: scopeId,
  });

  const relevantEntries = c.relevant_indices.map((i) => c.context_entries[i]);
  const distractorEntries = c.context_entries.filter((_, i) => !c.relevant_indices.includes(i));

  const retrievedRelevant = results.some((r) =>
    relevantEntries.some((rel) => r.content.includes(rel.slice(0, 30))),
  );
  const retrievedDistractor = results.some((r) =>
    distractorEntries.some((dis) => r.content.includes(dis.slice(0, 30))),
  );

  return {
    id: c.id,
    category: c.category,
    retrievedRelevant,
    retrievedDistractor,
    topResult: results[0]?.content ?? "(no results)",
  };
}

describe("Adversarial Retrieval (Tier 2)", () => {
  it("should report retrieval accuracy on vocabulary-mismatch questions", async () => {
    const cases = ADVERSARIAL_CASES.filter((c) => c.category === "vocabulary-mismatch");
    const results = await Promise.all(cases.map(runAdversarialCase));

    const relevantHits = results.filter((r) => r.retrievedRelevant).length;
    const distractorHits = results.filter((r) => r.retrievedDistractor).length;
    console.log(`Vocabulary mismatch: ${relevantHits}/${cases.length} found relevant, ${distractorHits}/${cases.length} found distractors`);

    // Document what happens — FTS will struggle with vocabulary mismatch
    for (const r of results) {
      console.log(`  ${r.id}: relevant=${r.retrievedRelevant} distractor=${r.retrievedDistractor} top="${r.topResult.slice(0, 60)}..."`);
    }
    expect(results.length).toBe(cases.length);
  }, 30000);

  it("should report retrieval accuracy on red-herring questions", async () => {
    const cases = ADVERSARIAL_CASES.filter((c) => c.category === "red-herring");
    const results = await Promise.all(cases.map(runAdversarialCase));

    const relevantHits = results.filter((r) => r.retrievedRelevant).length;
    console.log(`Red herring: ${relevantHits}/${cases.length} found relevant context`);

    for (const r of results) {
      console.log(`  ${r.id}: relevant=${r.retrievedRelevant} distractor=${r.retrievedDistractor} top="${r.topResult.slice(0, 60)}..."`);
    }
    expect(results.length).toBe(cases.length);
  }, 30000);

  it("should report retrieval accuracy on inference-required questions", async () => {
    const cases = ADVERSARIAL_CASES.filter((c) => c.category === "inference-required");
    const results = await Promise.all(cases.map(runAdversarialCase));

    const relevantHits = results.filter((r) => r.retrievedRelevant).length;
    console.log(`Inference required: ${relevantHits}/${cases.length} found at least one relevant entry`);

    for (const r of results) {
      console.log(`  ${r.id}: relevant=${r.retrievedRelevant} top="${r.topResult.slice(0, 60)}..."`);
    }
    expect(results.length).toBe(cases.length);
  }, 30000);

  it("should report retrieval accuracy on negation questions", async () => {
    const cases = ADVERSARIAL_CASES.filter((c) => c.category === "negation");
    const results = await Promise.all(cases.map(runAdversarialCase));

    console.log(`Negation: results for ${cases.length} cases`);
    for (const r of results) {
      console.log(`  ${r.id}: relevant=${r.retrievedRelevant} distractor=${r.retrievedDistractor} top="${r.topResult.slice(0, 60)}..."`);
    }
    expect(results.length).toBe(cases.length);
  }, 30000);

  it("should produce adversarial summary report", async () => {
    const allResults = await Promise.all(ADVERSARIAL_CASES.map(runAdversarialCase));

    const byCategory = new Map<string, { total: number; relevant: number; distractor: number }>();
    for (const r of allResults) {
      const cat = byCategory.get(r.category) ?? { total: 0, relevant: 0, distractor: 0 };
      cat.total++;
      if (r.retrievedRelevant) cat.relevant++;
      if (r.retrievedDistractor) cat.distractor++;
      byCategory.set(r.category, cat);
    }

    console.log("\n=== Adversarial Retrieval Report (FTS-only) ===");
    console.log("Category            | Relevant Found | Distractor Found");
    console.log("--------------------|----------------|------------------");
    for (const [cat, stats] of byCategory) {
      console.log(
        `${cat.padEnd(20)}| ${stats.relevant}/${stats.total}`.padEnd(38) + `| ${stats.distractor}/${stats.total}`,
      );
    }

    const totalRelevant = allResults.filter((r) => r.retrievedRelevant).length;
    console.log(`\nOverall: ${totalRelevant}/${allResults.length} questions found at least one relevant entry`);
    console.log("(Lower scores on vocabulary-mismatch demonstrate the need for semantic embeddings)");

    expect(allResults.length).toBe(ADVERSARIAL_CASES.length);
  }, 30000);
});
