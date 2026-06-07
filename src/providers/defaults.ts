import { LettaRuleSolverProvider } from "./adapters/LettaRuleSolverProvider.js";
import { GeminiClassifierProvider } from "./adapters/GeminiClassifierProvider.js";
import { Mem0MemoryProvider } from "./adapters/Mem0MemoryProvider.js";
import { Mem0RestTransport } from "../memory/transports/Mem0RestTransport.js";
import { Mem0EmbeddedTransport } from "../memory/transports/Mem0EmbeddedTransport.js";
import { MockEmbeddingProvider } from "./adapters/MockEmbeddingProvider.js";
import {
  OpenAICompatibleEmbeddingProvider,
  getEmbeddingConfig,
} from "./adapters/OpenAICompatibleEmbeddingProvider.js";
import { SQLiteHybridMemoryProvider } from "./adapters/SQLiteHybridMemoryProvider.js";
import {
  MockActionKnowledgeProvider,
  MockClassifierProvider,
  MockContextProvider,
  MockMemoryProvider,
  MockPolicyMatcherProvider,
  MockSessionProvider,
  MockTraceProvider,
} from "./mocks/index.js";
import { registerProvider } from "./registry.js";
import { seedLettaDefaultRules } from "../rules/lettaDefaults.js";
import { isGeminiConfigured } from "../llm/GeminiClient.js";
import type { MemoryProvider } from "./MemoryProvider.js";
import type { EmbeddingProvider } from "./EmbeddingProvider.js";

export function registerDefaultProviders(): void {
  // Embedding provider: real API if configured, else mock
  const embeddingConfig = getEmbeddingConfig();
  const embeddingProvider: EmbeddingProvider = embeddingConfig
    ? new OpenAICompatibleEmbeddingProvider(embeddingConfig)
    : new MockEmbeddingProvider();
  registerProvider("embedding", embeddingProvider);

  // Memory provider: mem0 when configured, else hybrid SQLite
  const memoryProvider = resolveMemoryProvider(embeddingProvider);
  registerProvider("memory", memoryProvider);

  registerProvider("session", new MockSessionProvider());
  registerProvider("context", new MockContextProvider());
  registerProvider("trace", new MockTraceProvider());
  registerProvider(
    "classifier",
    process.env.ENABLE_GEMINI_CLASSIFY === "true" && isGeminiConfigured()
      ? new GeminiClassifierProvider()
      : new MockClassifierProvider(),
  );
  registerProvider("policyMatcher", new MockPolicyMatcherProvider());

  const lettaProvider = new LettaRuleSolverProvider();
  seedLettaDefaultRules(lettaProvider);
  registerProvider("ruleSolver", lettaProvider);

  // ActionKnowledgeProvider with rule solver for recommendations/plans
  const actionProvider = new MockActionKnowledgeProvider();
  actionProvider.setRuleSolver(lettaProvider);
  registerProvider("action", actionProvider);
}

/**
 * Resolve memory provider based on MEMORY_PROVIDER env var.
 *
 * Values:
 *   "mock" (default) — MockMemoryProvider (SQLite-backed)
 *   "mem0"           — Mem0MemoryProvider with transport:
 *                        MEM0_TRANSPORT=rest      → HTTP sidecar (MEM0_BASE_URL required)
 *                        MEM0_TRANSPORT=embedded  → Python worker (lazy-start on first call)
 *                        MEM0_BASE_URL set        → REST (backward compat)
 *
 * Feature flags for incremental adoption:
 *   MEMORY_EXTRACTION_PROVIDER=mem0  — use mem0 for extraction only
 *   MEMORY_RETRIEVAL_PROVIDER=mem0   — use mem0 for retrieval only
 *   MEMORY_DEDUP_PROVIDER=mem0       — use mem0 for deduplication only
 */
function resolveMemoryProvider(embeddingProvider: EmbeddingProvider): MemoryProvider {
  const providerName = process.env.MEMORY_PROVIDER ?? "mock";

  if (providerName === "mem0") {
    const transportMode = process.env.MEM0_TRANSPORT ?? (process.env.MEM0_BASE_URL ? "rest" : "embedded");

    if (transportMode === "rest") {
      const baseUrl = process.env.MEM0_BASE_URL;
      if (!baseUrl) {
        console.warn("[agent-core] MEM0_TRANSPORT=rest but MEM0_BASE_URL not set. Falling back to mock.");
        return new MockMemoryProvider();
      }
      return new Mem0MemoryProvider(
        new Mem0RestTransport({ baseUrl, apiKey: process.env.MEM0_API_KEY }),
      );
    }

    // Embedded worker: lazy-starts on first call (start() is async,
    // called automatically inside call() if not already running)
    const embedded = new Mem0EmbeddedTransport({
      pythonPath: process.env.MEM0_PYTHON_PATH,
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          ([k]) =>
            k.startsWith("MEM0_") ||
            k.startsWith("OPENAI_") ||
            k === "DEEPSEEK_API_KEY" ||
            k === "VOYAGE_API_KEY",
        ) as [string, string][],
      ),
    });
    return new Mem0MemoryProvider(embedded);
  }

  return new SQLiteHybridMemoryProvider(embeddingProvider);
}
