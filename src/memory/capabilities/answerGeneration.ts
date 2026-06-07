/**
 * Answer generation over retrieved memories.
 *
 * Pattern: cognee's GraphCompletionRetriever (retrieve → format → LLM completion).
 * Integrates abstention gate — refuses when evidence is insufficient.
 */

import { z } from "zod";
import type { LLMClient } from "../../llm/LLMClient.js";
import { llmJson } from "../../llm/LLMJson.js";
import type { MemoryProvider, MemorySearchParams } from "../../providers/MemoryProvider.js";
import type { AnswerResult, MemoryEvidence } from "./types.js";

const AnswerSchema = z.object({
  answer: z.string(),
  confidence: z.number().min(0).max(1),
  abstained: z.boolean(),
  reasoning: z.string().optional(),
  cited_ids: z.array(z.string()),
});

export interface AnswerGenerationConfig {
  abstention_threshold: number;
  min_evidence: number;
  max_evidence: number;
  contradiction_sensitivity: number;
}

const DEFAULT_CONFIG: AnswerGenerationConfig = {
  abstention_threshold: 0.3,
  min_evidence: 1,
  max_evidence: 10,
  contradiction_sensitivity: 0.7,
};

const SYSTEM_PROMPT = `You are a memory-grounded answer system. Given a question and retrieved memory evidence, generate a precise answer.

Rules:
- Base your answer ONLY on the provided evidence
- If the evidence is insufficient, contradictory, or irrelevant, set abstained=true and explain in reasoning
- Confidence: 0.9+ when multiple pieces of evidence agree, 0.5-0.8 for single-source answers, <0.3 triggers abstention
- cited_ids: list the evidence IDs you used
- Be concise and factual

Return JSON: { "answer": "...", "confidence": 0.0-1.0, "abstained": false, "reasoning": "...", "cited_ids": ["id1"] }`;

export async function generateAnswer(
  query: string,
  evidence: MemoryEvidence[],
  llm: LLMClient,
  config: Partial<AnswerGenerationConfig> = {},
): Promise<AnswerResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const start = Date.now();

  // Abstention check: not enough evidence
  if (evidence.length < cfg.min_evidence) {
    return {
      answer: "",
      confidence: 0,
      evidence,
      abstained: true,
      reasoning: `Insufficient evidence: found ${evidence.length}, need ${cfg.min_evidence}`,
      latency_ms: Date.now() - start,
    };
  }

  const topEvidence = evidence.slice(0, cfg.max_evidence);
  const evidenceText = topEvidence
    .map((e) => `[${e.id}] (score=${e.score.toFixed(3)}): ${e.content}`)
    .join("\n");

  const result = await llmJson(llm, AnswerSchema, [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Question: ${query}\n\nEvidence:\n${evidenceText}`,
    },
  ]);

  const latency_ms = Date.now() - start;

  if (!result.success) {
    return {
      answer: "",
      confidence: 0,
      evidence: topEvidence,
      abstained: true,
      reasoning: `LLM error: ${result.error}`,
      latency_ms,
    };
  }

  const data = result.data;

  // Post-hoc abstention gate
  if (data.confidence < cfg.abstention_threshold && !data.abstained) {
    return {
      answer: data.answer,
      confidence: data.confidence,
      evidence: topEvidence,
      abstained: true,
      reasoning: `Low confidence (${data.confidence}) below threshold (${cfg.abstention_threshold})`,
      usage: result.usage ?? undefined,
      latency_ms,
    };
  }

  return {
    answer: data.answer,
    confidence: data.confidence,
    evidence: topEvidence,
    abstained: data.abstained,
    reasoning: data.reasoning,
    usage: result.usage ?? undefined,
    latency_ms,
  };
}

/** Full pipeline: search → generate answer. */
export async function searchAndAnswer(
  query: string,
  searchParams: Omit<MemorySearchParams, "query">,
  memory: MemoryProvider,
  llm: LLMClient,
  config: Partial<AnswerGenerationConfig> = {},
): Promise<AnswerResult> {
  const results = await memory.search({ query, ...searchParams });

  const evidence: MemoryEvidence[] = results.map((r) => ({
    id: r.id,
    content: r.content,
    score: r.score,
    metadata: r.metadata,
  }));

  return generateAnswer(query, evidence, llm, config);
}
