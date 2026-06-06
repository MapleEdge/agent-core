/**
 * Schema-constrained JSON helper for LLM outputs.
 *
 * Flow:
 *   1. Send prompt to LLM (json_mode = true)
 *   2. Parse response as JSON
 *   3. Validate against Zod schema
 *   4. On failure, retry once with error feedback
 *   5. Return structured error if still invalid
 */

import type { z } from "zod";
import type { LLMClient, LLMMessage, LLMResponse, LLMUsage } from "./LLMClient.js";

export interface LLMJsonResult<T> {
  success: true;
  data: T;
  raw: string;
  usage: LLMUsage | null;
  model: string;
  latency_ms: number;
  retries: number;
}

export interface LLMJsonError {
  success: false;
  error: string;
  error_type: "json_parse" | "schema_validation" | "llm_error";
  raw?: string;
  retries: number;
}

export type LLMJsonResponse<T> = LLMJsonResult<T> | LLMJsonError;

export async function llmJson<T>(
  client: LLMClient,
  schema: z.ZodType<T>,
  messages: LLMMessage[],
  options?: { temperature?: number; max_tokens?: number },
): Promise<LLMJsonResponse<T>> {
  let lastResponse: LLMResponse | null = null;
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    let response: LLMResponse;
    try {
      const callMessages =
        attempt === 0
          ? messages
          : [
              ...messages,
              { role: "assistant" as const, content: lastResponse?.content ?? "" },
              {
                role: "user" as const,
                content: `Your previous response was invalid JSON or did not match the required schema. Please fix and respond with valid JSON only. Errors: ${lastError}`,
              },
            ];
      response = await client.chat(callMessages, {
        temperature: options?.temperature ?? 0.1,
        max_tokens: options?.max_tokens ?? 2048,
        json_mode: true,
      });
    } catch (err) {
      return {
        success: false,
        error: String(err),
        error_type: "llm_error",
        retries: attempt,
      };
    }

    lastResponse = response;

    // Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      lastError = `JSON parse error: ${response.content.slice(0, 200)}`;
      if (attempt === 1) {
        return {
          success: false,
          error: "Failed to parse JSON after retry",
          error_type: "json_parse",
          raw: response.content,
          retries: 2,
        };
      }
      continue;
    }

    // Validate with Zod
    const result = schema.safeParse(parsed);
    if (result.success) {
      return {
        success: true,
        data: result.data,
        raw: response.content,
        usage: response.usage,
        model: response.model,
        latency_ms: response.latency_ms,
        retries: attempt,
      };
    }

    lastError = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    if (attempt === 1) {
      return {
        success: false,
        error: `Schema validation failed after retry: ${lastError}`,
        error_type: "schema_validation",
        raw: response.content,
        retries: 2,
      };
    }
  }

  return {
    success: false,
    error: "Unexpected: exhausted retries",
    error_type: "llm_error",
    retries: 2,
  };
}
