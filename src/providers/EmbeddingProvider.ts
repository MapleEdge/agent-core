/**
 * EmbeddingProvider interface.
 *
 * Provider-agnostic embedding generation. All vector operations in the memory
 * subsystem go through this interface, allowing provider swaps without
 * changing retrieval logic.
 *
 * Expected implementations:
 *   - MockEmbeddingProvider (built-in, hash-based deterministic)
 *   - OpenAICompatibleEmbeddingProvider (DeepSeek/OpenRouter/local inference)
 *   - LocalEmbeddingProvider (future Ollama/sentence-transformer)
 */

import type { ProviderStatus } from "./registry.js";

export interface EmbeddingProvider {
  readonly name: string;
  readonly status: ProviderStatus;
  readonly dimensions: number;

  /** Generate embeddings for one or more texts. Returns one vector per input. */
  embed(texts: string[]): Promise<number[][]>;
}
