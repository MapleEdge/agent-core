# DeepSeek Integration

agent-core uses DeepSeek as its first real LLM provider for classification and memory extraction.

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEEPSEEK_API_KEY` | Yes | — | API key from [platform.deepseek.com](https://platform.deepseek.com) |
| `DEEPSEEK_BASE_URL` | No | `https://api.deepseek.com` | API base URL |
| `DEEPSEEK_MODEL` | No | `deepseek-chat` | Model name |

## Feature Flags

LLM-powered endpoints are **disabled by default**. Enable per-endpoint:

| Flag | Endpoint | Description |
|------|----------|-------------|
| `ENABLE_LLM_CLASSIFY=true` | `POST /classify/task` | Use DeepSeek for task classification |
| `ENABLE_LLM_EXTRACT=true` | `POST /memory/extract` | Use DeepSeek for memory extraction |
| `ENABLE_LLM_EVALS=true` | `pnpm eval:llm` | Run LLM evaluation suite |

When a flag is not set or the API key is missing, the endpoint falls back to mock/keyword-based behavior.

## Architecture

```
src/llm/
├── LLMClient.ts       — Provider-neutral interface
├── DeepSeekClient.ts   — DeepSeek adapter (OpenAI-compatible API)
├── LLMJson.ts          — Schema-constrained JSON helper
├── errors.ts           — Error hierarchy
└── index.ts            — Re-exports
```

### LLMJson flow

1. Send prompt with `json_mode: true`
2. Parse response as JSON
3. Validate against Zod schema
4. On failure: retry once with error feedback
5. Return structured `LLMJsonResult<T>` or `LLMJsonError`

This ensures all LLM outputs are type-safe and schema-validated before reaching callers.

## Execution Boundary

DeepSeek is used **only for classification and extraction** — never for executing actions.
agent-core does not use LLMs to perform side effects. The future platform owns real action execution, authorization, and side-effect management.

## Cost

DeepSeek pricing (as of 2025):
- Input: $0.14/M tokens
- Output: $0.28/M tokens

The eval runner reports estimated cost per run. A full eval suite (18 fixtures) typically costs < $0.01.

## Running Evals

```bash
export DEEPSEEK_API_KEY=your-key-here
export ENABLE_LLM_EVALS=true
pnpm eval:llm
```

See [docs/evaluation.md](evaluation.md) for eval output format and interpretation.
