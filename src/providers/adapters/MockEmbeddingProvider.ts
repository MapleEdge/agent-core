/**
 * MockEmbeddingProvider — deterministic hash-based pseudo-embeddings.
 *
 * Same input always produces the same vector. No external APIs required.
 * Semantically similar strings produce somewhat correlated vectors via
 * token-level hashing with overlap.
 */

import type { EmbeddingProvider } from "../EmbeddingProvider.js";
import type { ProviderStatus } from "../registry.js";

const DEFAULT_DIMENSIONS = 128;

export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = "mock-embedding";
  readonly status: ProviderStatus = "mock";
  readonly dimensions: number;

  constructor(dimensions: number = DEFAULT_DIMENSIONS) {
    this.dimensions = dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.hashEmbed(text));
  }

  private hashEmbed(text: string): number[] {
    const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
    const vec = new Float64Array(this.dimensions);

    for (const token of tokens) {
      const hash = fnv1a(token);
      // Spread each token across multiple dimensions for better coverage
      for (let i = 0; i < 8; i++) {
        const idx = Math.abs((hash * (i + 1) + i * 2654435761) | 0) % this.dimensions;
        const val = ((hash >>> (i * 4)) & 0xf) / 15.0 - 0.5;
        vec[idx] += val;
      }
    }

    // Normalize to unit vector
    let norm = 0;
    for (let i = 0; i < this.dimensions; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < this.dimensions; i++) vec[i] /= norm;
    } else {
      // Zero text — return small random-ish vector
      for (let i = 0; i < this.dimensions; i++) vec[i] = 1 / this.dimensions;
    }

    return Array.from(vec);
  }
}

/** FNV-1a 32-bit hash. Fast, deterministic, good distribution. */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) | 0;
  }
  return hash >>> 0;
}
