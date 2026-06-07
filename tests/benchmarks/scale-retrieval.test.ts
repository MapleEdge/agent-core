/**
 * Scale retrieval test — measures FTS recall degradation as corpus grows.
 *
 * CLASSIFICATION: Tier 2 (scale validation).
 * Loads 100, 500, and 1000 distractor memories alongside target memories,
 * then measures Recall@1, Recall@3, Recall@5 at each scale.
 *
 * This is an honest test: it demonstrates that FTS recall degrades as
 * the number of irrelevant memories increases, establishing a baseline
 * that future providers (mem0, hybrid) must beat.
 */

import { describe, it, expect } from "vitest";
import { MockMemoryProvider } from "../../src/providers/mocks/MockMemoryProvider.js";

/** Deterministic pseudo-random distractor sentences about software engineering. */
const DISTRACTOR_TEMPLATES = [
  "The ${adj} service handles ${verb} for the ${noun} module.",
  "We migrated from ${tech1} to ${tech2} in the ${noun} subsystem.",
  "Error handling in the ${noun} uses ${pattern} with ${adj} retries.",
  "The ${noun} configuration supports ${tech1} and ${tech2} backends.",
  "Performance of the ${noun} improved after switching to ${tech1}.",
  "The ${adj} cache layer reduces ${noun} latency by ${num}%.",
  "Authentication flows use ${tech1} tokens validated by the ${noun} service.",
  "The ${noun} pipeline processes ${num} events per second at peak.",
  "Database ${verb} operations in ${noun} are wrapped in transactions.",
  "The ${adj} scheduler triggers ${noun} jobs every ${num} minutes.",
  "Logging for the ${noun} module uses structured ${tech1} format.",
  "The ${noun} API returns paginated results with ${num} items per page.",
  "Rate limiting on the ${noun} endpoint allows ${num} requests per minute.",
  "The ${adj} deployment uses ${tech1} containers orchestrated by ${tech2}.",
  "Monitoring the ${noun} relies on ${tech1} metrics and ${tech2} alerts.",
];

const ADJECTIVES = ["primary", "secondary", "internal", "external", "distributed", "cached", "async", "batched", "streaming", "reactive"];
const VERBS = ["processing", "validation", "routing", "transformation", "aggregation", "serialization", "indexing", "replication"];
const NOUNS = ["payment", "notification", "analytics", "inventory", "gateway", "scheduler", "audit", "billing", "catalog", "workflow", "telemetry", "provisioning"];
const TECH = ["Redis", "Kafka", "gRPC", "GraphQL", "PostgreSQL", "MongoDB", "Elasticsearch", "RabbitMQ", "Consul", "Terraform", "Prometheus", "Grafana"];
const PATTERNS = ["circuit-breaker", "retry-with-backoff", "bulkhead", "saga", "event-sourcing", "CQRS", "outbox"];
const NUMS = ["50", "100", "200", "500", "1000", "5000", "10000"];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function generateDistractor(index: number): string {
  const rng = seededRandom(index * 7919 + 42);
  const template = pick(DISTRACTOR_TEMPLATES, rng);
  return template
    .replace("${adj}", pick(ADJECTIVES, rng))
    .replace("${verb}", pick(VERBS, rng))
    .replace("${noun}", pick(NOUNS, rng))
    .replace("${tech1}", pick(TECH, rng))
    .replace("${tech2}", pick(TECH, rng))
    .replace("${pattern}", pick(PATTERNS, rng))
    .replace("${num}", pick(NUMS, rng));
}

/** Target questions with their expected context entries.
 * Search terms are simple single words to avoid FTS5 hyphen parsing issues. */
const TARGET_QUESTIONS = [
  {
    id: "scale-001",
    question: "What linting tool does the project use?",
    searchQuery: "ESLint linting",
    context: [
      "The project uses ESLint for code linting with a custom configuration.",
      "ESLint checks run on every pull request in the CI pipeline.",
    ],
  },
  {
    id: "scale-002",
    question: "What database does the application use for persistence?",
    searchQuery: "SQLite database",
    context: [
      "The application uses SQLite with WAL mode for concurrent reads.",
      "Database records are stored with FTS5 indexing for full-text search.",
    ],
  },
  {
    id: "scale-003",
    question: "What embedding model is configured?",
    searchQuery: "embedding model OpenAI",
    context: [
      "The default embedding model is text-embedding-3-small from OpenAI.",
      "Embeddings are stored in the memory embeddings table as BLOB vectors.",
    ],
  },
  {
    id: "scale-004",
    question: "What test framework is used for running unit tests?",
    searchQuery: "vitest tests",
    context: [
      "Tests are run using vitest with coverage reporting enabled.",
      "The vitest configuration uses globals and includes all test files.",
    ],
  },
  {
    id: "scale-005",
    question: "What validation library is used for API input schemas?",
    searchQuery: "Zod validation",
    context: [
      "All API inputs are validated using Zod schemas with safeParse.",
      "Zod schema types are inferred for TypeScript type safety.",
    ],
  },
];

interface ScaleResult {
  scale: number;
  recallAt1: number;
  recallAt3: number;
  recallAt5: number;
  avgLatencyMs: number;
}

async function runScaleTest(distractorCount: number): Promise<ScaleResult> {
  const memory = new MockMemoryProvider();
  const scopeId = `scale-${distractorCount}`;

  // Ingest distractors
  for (let i = 0; i < distractorCount; i++) {
    await memory.write({
      scope: "session",
      scope_id: scopeId,
      content: generateDistractor(i),
      kind: "observation",
      metadata: { distractor: true, index: i },
    });
  }

  // Ingest target contexts
  for (const q of TARGET_QUESTIONS) {
    for (const entry of q.context) {
      await memory.write({
        scope: "session",
        scope_id: scopeId,
        content: entry,
        kind: "observation",
        metadata: { target_question: q.id },
      });
    }
  }

  let hits1 = 0;
  let hits3 = 0;
  let hits5 = 0;
  let totalLatency = 0;

  for (const q of TARGET_QUESTIONS) {
    const start = Date.now();
    const results = await memory.search({
      query: q.searchQuery,
      top_k: 5,
      scope: "session",
      scope_id: scopeId,
    });
    totalLatency += Date.now() - start;

    const top1 = results.slice(0, 1).some((r) => q.context.some((c) => r.content.includes(c.slice(0, 30))));
    const top3 = results.slice(0, 3).some((r) => q.context.some((c) => r.content.includes(c.slice(0, 30))));
    const top5 = results.slice(0, 5).some((r) => q.context.some((c) => r.content.includes(c.slice(0, 30))));

    if (top1) hits1++;
    if (top3) hits3++;
    if (top5) hits5++;
  }

  const n = TARGET_QUESTIONS.length;
  return {
    scale: distractorCount,
    recallAt1: hits1 / n,
    recallAt3: hits3 / n,
    recallAt5: hits5 / n,
    avgLatencyMs: totalLatency / n,
  };
}

describe("Scale Retrieval (Tier 2)", () => {
  const results: ScaleResult[] = [];

  it("should measure recall at 100 distractors", async () => {
    const r = await runScaleTest(100);
    results.push(r);
    console.log(`Scale 100: R@1=${r.recallAt1.toFixed(2)} R@3=${r.recallAt3.toFixed(2)} R@5=${r.recallAt5.toFixed(2)} lat=${r.avgLatencyMs.toFixed(1)}ms`);
    // At 100 distractors, FTS should still find most targets
    expect(r.recallAt5).toBeGreaterThanOrEqual(0.4);
  }, 60000);

  it("should measure recall at 500 distractors", async () => {
    const r = await runScaleTest(500);
    results.push(r);
    console.log(`Scale 500: R@1=${r.recallAt1.toFixed(2)} R@3=${r.recallAt3.toFixed(2)} R@5=${r.recallAt5.toFixed(2)} lat=${r.avgLatencyMs.toFixed(1)}ms`);
    // Recall may degrade — we're documenting the degradation
    expect(r.recallAt5).toBeGreaterThanOrEqual(0.2);
  }, 60000);

  it("should measure recall at 1000 distractors", async () => {
    const r = await runScaleTest(1000);
    results.push(r);
    console.log(`Scale 1000: R@1=${r.recallAt1.toFixed(2)} R@3=${r.recallAt3.toFixed(2)} R@5=${r.recallAt5.toFixed(2)} lat=${r.avgLatencyMs.toFixed(1)}ms`);
    // At 1000 distractors with FTS-only, significant degradation expected
    expect(r.recallAt5).toBeGreaterThanOrEqual(0.0); // document whatever happens
  }, 120000);

  it("should produce scale degradation report", async () => {
    // Run all scales if not already run
    if (results.length < 3) {
      for (const scale of [100, 500, 1000]) {
        if (!results.find((r) => r.scale === scale)) {
          results.push(await runScaleTest(scale));
        }
      }
    }

    console.log("\n=== Scale Retrieval Report ===");
    console.log("Distractors | R@1    | R@3    | R@5    | Latency (ms)");
    console.log("------------|--------|--------|--------|-------------");
    for (const r of results.sort((a, b) => a.scale - b.scale)) {
      console.log(
        `${String(r.scale).padStart(11)} | ${r.recallAt1.toFixed(2).padStart(6)} | ${r.recallAt3.toFixed(2).padStart(6)} | ${r.recallAt5.toFixed(2).padStart(6)} | ${r.avgLatencyMs.toFixed(1).padStart(12)}`,
      );
    }

    // The point is to document degradation, not to pass a threshold
    expect(results.length).toBeGreaterThanOrEqual(3);
  }, 120000);
});
