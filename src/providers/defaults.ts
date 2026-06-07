import { LettaRuleSolverProvider } from "./adapters/LettaRuleSolverProvider.js";
import { GeminiClassifierProvider } from "./adapters/GeminiClassifierProvider.js";
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

export function registerDefaultProviders(): void {
  registerProvider("memory", new MockMemoryProvider());
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
