/**
 * Provider-neutral LLM client interface.
 *
 * Implementations must be stateless — configuration comes from the
 * environment, not constructor arguments. This keeps the interface
 * thin and avoids coupling callers to provider-specific options.
 */

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface LLMResponse {
  content: string;
  usage: LLMUsage | null;
  model: string;
  latency_ms: number;
}

export interface LLMClient {
  readonly provider: string;

  /**
   * Send a chat-completion request.
   * Implementations should read config (API key, model, base URL) from
   * environment variables — never from hardcoded secrets.
   */
  chat(messages: LLMMessage[], options?: LLMChatOptions): Promise<LLMResponse>;
}

export interface LLMChatOptions {
  temperature?: number;
  max_tokens?: number;
  /** When true, hint that the response should be valid JSON. */
  json_mode?: boolean;
}
