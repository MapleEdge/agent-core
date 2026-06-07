/**
 * OpenAI-compatible embedding provider.
 *
 * Works with any API implementing the OpenAI /v1/embeddings endpoint:
 *   - OpenAI (text-embedding-3-small)
 *   - DeepSeek (default)
 *   - OpenRouter
 *   - Local inference servers (vLLM, llama.cpp, etc.)
 *
 * Configuration via env:
 *   EMBEDDING_API_KEY     — API key
 *   EMBEDDING_BASE_URL    — API base URL (default: DeepSeek)
 *   EMBEDDING_MODEL       — model name
 */

import type { EmbeddingProvider } from "../EmbeddingProvider.js";
import type { ProviderStatus } from "../registry.js";

export interface OpenAIEmbeddingConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  dimensions?: number;
}

interface EmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage?: { prompt_tokens: number; total_tokens: number };
}

export function getEmbeddingConfig(): OpenAIEmbeddingConfig | null {
  const apiKey = process.env.EMBEDDING_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: process.env.EMBEDDING_BASE_URL ?? "https://api.deepseek.com/v1",
    model: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
    dimensions: process.env.EMBEDDING_DIMENSIONS ? parseInt(process.env.EMBEDDING_DIMENSIONS) : undefined,
  };
}

export class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai-compatible-embedding";
  readonly status: ProviderStatus = "adapter";
  readonly dimensions: number;

  private config: OpenAIEmbeddingConfig;

  constructor(config: OpenAIEmbeddingConfig) {
    this.config = config;
    this.dimensions = config.dimensions ?? 1536;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const url = `${this.config.baseUrl.replace(/\/+$/, "")}/embeddings`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        input: texts,
        ...(this.config.dimensions ? { dimensions: this.config.dimensions } : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Embedding API error ${response.status}: ${body.slice(0, 200)}`);
    }

    const result = (await response.json()) as EmbeddingResponse;
    // Sort by index to maintain input order
    return result.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}
