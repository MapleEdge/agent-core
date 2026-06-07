/**
 * Gemini LLM adapter.
 *
 * Configuration via environment variables:
 *   GEMINI_API_KEY   — required
 *   GEMINI_BASE_URL  — default: https://generativelanguage.googleapis.com/v1beta/openai
 *   GEMINI_MODEL     — default: gemini-2.0-flash
 *
 * Uses Gemini's OpenAI-compatible chat/completions endpoint.
 */

import type { LLMClient, LLMMessage, LLMChatOptions, LLMResponse, LLMUsage } from "./LLMClient.js";
import { LLMError, LLMUnavailableError } from "./errors.js";

export function getGeminiConfig() {
  return {
    apiKey: process.env.GEMINI_API_KEY ?? "",
    baseUrl: process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai",
    model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
  };
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export class GeminiClient implements LLMClient {
  readonly provider = "gemini";

  async chat(messages: LLMMessage[], options?: LLMChatOptions): Promise<LLMResponse> {
    const config = getGeminiConfig();
    if (!config.apiKey) {
      throw new LLMUnavailableError("gemini");
    }

    const body: Record<string, unknown> = {
      model: config.model,
      messages,
    };
    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.max_tokens !== undefined) body.max_tokens = options.max_tokens;
    if (options?.json_mode) body.response_format = { type: "json_object" };

    const start = performance.now();
    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new LLMError(`Gemini request failed: ${String(err)}`, "gemini", err);
    }

    const latency_ms = performance.now() - start;
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new LLMError(`Gemini API error ${response.status}: ${text.slice(0, 500)}`, "gemini");
    }

    const json = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      model?: string;
    };
    const usage: LLMUsage | null = json.usage
      ? {
          prompt_tokens: json.usage.prompt_tokens,
          completion_tokens: json.usage.completion_tokens,
          total_tokens: json.usage.total_tokens,
        }
      : null;

    return {
      content: json.choices?.[0]?.message?.content ?? "",
      usage,
      model: json.model ?? config.model,
      latency_ms,
    };
  }
}
