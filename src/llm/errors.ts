export class LLMError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

export class LLMJsonParseError extends LLMError {
  constructor(
    provider: string,
    public readonly rawOutput: string,
    cause?: unknown,
  ) {
    super("LLM returned invalid JSON", provider, cause);
    this.name = "LLMJsonParseError";
  }
}

export class LLMSchemaValidationError extends LLMError {
  constructor(
    provider: string,
    public readonly parsed: unknown,
    public readonly zodErrors: unknown[],
  ) {
    super("LLM output failed schema validation", provider);
    this.name = "LLMSchemaValidationError";
  }
}

export class LLMUnavailableError extends LLMError {
  constructor(provider: string, cause?: unknown) {
    super(`LLM provider "${provider}" is not configured or unreachable`, provider, cause);
    this.name = "LLMUnavailableError";
  }
}
