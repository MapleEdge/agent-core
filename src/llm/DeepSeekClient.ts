/**
 * DeepSeek LLM adapter.
 *
 * Configuration via environment variables:
 *   DEEPSEEK_API_KEY   — required
 *   DEEPSEEK_BASE_URL  — default: https://api.deepseek.com
 *   DEEPSEEK_MODEL     — default: deepseek-v4-flash (deepseek-chat deprecated 2026-07-24)
 *
 * Uses the OpenAI-compatible chat/completions endpoint.
 */

import type { LLMClient, LLMMessage, LLMChatOptions, LLMResponse, LLMUsage } from "./LLMClient.js";
import { LLMError, LLMUnavailableError } from "./errors.js";

export function getDeepSeekConfig() {
  return {
    apiKey: process.env.DEEPSEEK_API_KEY ?? "",
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
  };
}

export function isDeepSeekConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

export class DeepSeekClient implements LLMClient {
  readonly provider = "deepseek";

  async chat(messages: LLMMessage[], options?: LLMChatOptions): Promise<LLMResponse> {
    const config = getDeepSeekConfig();
    if (!config.apiKey) {
      throw new LLMUnavailableError("deepseek");
    }

    const url = `${config.baseUrl}/v1/chat/completions`;
    const body: Record<string, unknown> = {
      model: config.model,
      messages,
    };
    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.max_tokens !== undefined) body.max_tokens = options.max_tokens;
    if (options?.json_mode) {
      body.response_format = { type: "json_object" };
    }

    const start = performance.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new LLMError(`DeepSeek request failed: ${String(err)}`, "deepseek", err);
    }
    const latency_ms = performance.now() - start;

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new LLMError(
        `DeepSeek API error ${res.status}: ${text.slice(0, 500)}`,
        "deepseek",
      );
    }

    const json = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      model?: string;
    };

    const content = json.choices?.[0]?.message?.content ?? "";
    const usage: LLMUsage | null = json.usage
      ? {
          prompt_tokens: json.usage.prompt_tokens,
          completion_tokens: json.usage.completion_tokens,
          total_tokens: json.usage.total_tokens,
        }
      : null;

    return {
      content,
      usage,
      model: json.model ?? config.model,
      latency_ms,
    };
  }
}
