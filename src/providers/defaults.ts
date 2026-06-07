import { LettaRuleSolverProvider } from "./adapters/LettaRuleSolverProvider.js";
import { GeminiClassifierProvider } from "./adapters/GeminiClassifierProvider.js";
import { Mem0MemoryProvider, getMem0Config } from "./adapters/Mem0MemoryProvider.js";
import {
  MockActionProvider,
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

export function registerDefaultProviders(): void {
  // Memory provider: mem0 adapter when configured, else mock
  const memoryProvider = resolveMemoryProvider();
  registerProvider("memory", memoryProvider);

  registerProvider("session", new MockSessionProvider());
  registerProvider("context", new MockContextProvider());
  registerProvider("action", new MockActionProvider());
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
}

/**
 * Resolve memory provider based on MEMORY_PROVIDER env var.
 *
 * Values:
 *   "mock" (default) — MockMemoryProvider (SQLite-backed)
 *   "mem0"           — Mem0MemoryProvider (requires MEM0_BASE_URL)
 *
 * Feature flags for incremental adoption:
 *   MEMORY_EXTRACTION_PROVIDER=mem0  — use mem0 for extraction only
 *   MEMORY_RETRIEVAL_PROVIDER=mem0   — use mem0 for retrieval only
 *   MEMORY_DEDUP_PROVIDER=mem0       — use mem0 for deduplication only
 *
 * When MEMORY_PROVIDER=mem0, all sub-features default to mem0.
 * Individual feature flags allow hybrid strategies.
 */
function resolveMemoryProvider(): MemoryProvider {
  const providerName = process.env.MEMORY_PROVIDER ?? "mock";

  if (providerName === "mem0") {
    const config = getMem0Config();
    if (!config) {
      console.warn(
        "[agent-core] MEMORY_PROVIDER=mem0 but MEM0_BASE_URL not set. Falling back to mock.",
      );
      return new MockMemoryProvider();
    }
    return new Mem0MemoryProvider(config);
  }

  return new MockMemoryProvider();
}
