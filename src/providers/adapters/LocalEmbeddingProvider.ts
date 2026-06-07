/**
 * LocalEmbeddingProvider — stub for future local embedding support.
 *
 * Planned backends:
 *   - Ollama (HTTP API)
 *   - sentence-transformers (Python sidecar)
 *   - ONNX Runtime (native Node.js)
 *
 * Currently delegates to MockEmbeddingProvider.
 */

import type { EmbeddingProvider } from "../EmbeddingProvider.js";
import type { ProviderStatus } from "../registry.js";
import { MockEmbeddingProvider } from "./MockEmbeddingProvider.js";

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local-embedding";
  readonly status: ProviderStatus = "mock";
  readonly dimensions: number;

  private delegate: MockEmbeddingProvider;

  constructor(dimensions: number = 128) {
    this.dimensions = dimensions;
    this.delegate = new MockEmbeddingProvider(dimensions);
  }

  async embed(texts: string[]): Promise<number[][]> {
    // TODO: Replace with real local embedding when backend is available
    return this.delegate.embed(texts);
  }
}
