import { LettaRuleSolverProvider } from "./adapters/LettaRuleSolverProvider.js";
import { GeminiClassifierProvider } from "./adapters/GeminiClassifierProvider.js";
import { MockEmbeddingProvider } from "./adapters/MockEmbeddingProvider.js";
import {
  OpenAICompatibleEmbeddingProvider,
  getEmbeddingConfig,
} from "./adapters/OpenAICompatibleEmbeddingProvider.js";
import { SQLiteHybridMemoryProvider } from "./adapters/SQLiteHybridMemoryProvider.js";
import {
  MockActionProvider,
  MockClassifierProvider,
  MockContextProvider,
  MockPolicyMatcherProvider,
  MockSessionProvider,
  MockTraceProvider,
} from "./mocks/index.js";
import { registerProvider } from "./registry.js";
import { seedLettaDefaultRules } from "../rules/lettaDefaults.js";
import { isGeminiConfigured } from "../llm/GeminiClient.js";
import type { EmbeddingProvider } from "./EmbeddingProvider.js";

export function registerDefaultProviders(): void {
  // Embedding provider: real API if configured, else mock
  const embeddingConfig = getEmbeddingConfig();
  const embeddingProvider: EmbeddingProvider = embeddingConfig
    ? new OpenAICompatibleEmbeddingProvider(embeddingConfig)
    : new MockEmbeddingProvider();
  registerProvider("embedding", embeddingProvider);

  // Memory: hybrid provider backed by embedding
  registerProvider("memory", new SQLiteHybridMemoryProvider(embeddingProvider));
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
