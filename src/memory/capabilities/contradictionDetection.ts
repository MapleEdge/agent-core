/**
 * Contradiction detection — identify conflicting facts across memories.
 *
 * Native implementation, adapting Parlant's CoherenceCheckDocument structure:
 *   { kind, first, second, issue, severity }
 *
 * Uses pairwise LLM evaluation for semantic conflict detection.
 */

import { z } from "zod";
import type { LLMClient } from "../../llm/LLMClient.js";
import { llmJson } from "../../llm/LLMJson.js";
import type { MemoryEvidence, Contradiction } from "./types.js";

const ContradictionSchema = z.object({
  contradictions: z.array(
    z.object({
      first_index: z.number(),
      second_index: z.number(),
      issue: z.string(),
      severity: z.number().min(0).max(1),
    }),
  ),
});

const SYSTEM_PROMPT = `You are a contradiction detection system. Given a list of memory facts, identify pairs that contradict each other.

Types of contradictions:
1. Direct conflict: "X prefers tabs" vs "X prefers spaces"
2. Temporal supersession: "X uses React 17" vs "X migrated to React 19" (the later one supersedes)
3. Factual inconsistency: "API uses REST" vs "API uses GraphQL" (when referring to the same API)

Severity:
- 0.9-1.0: Direct logical contradiction
- 0.6-0.8: Likely outdated/superseded information
- 0.3-0.5: Potential conflict, context-dependent

Only report genuine contradictions. Similar or complementary facts are NOT contradictions.

Return JSON: { "contradictions": [ { "first_index": 0, "second_index": 1, "issue": "...", "severity": 0.0-1.0 } ] }`;

/**
 * Detect contradictions among a set of memory evidence.
 * Uses batch LLM evaluation for efficiency.
 */
export async function detectContradictions(
  evidence: MemoryEvidence[],
  llm: LLMClient,
): Promise<Contradiction[]> {
  if (evidence.length < 2) return [];

  // For small sets, evaluate all at once
  if (evidence.length <= 20) {
    return evaluateBatch(evidence, llm);
  }

  // For larger sets, chunk and evaluate
  const contradictions: Contradiction[] = [];
  const chunkSize = 15;
  for (let i = 0; i < evidence.length; i += chunkSize) {
    const chunk = evidence.slice(i, Math.min(i + chunkSize, evidence.length));
    const chunkResults = await evaluateBatch(chunk, llm);
    contradictions.push(...chunkResults);
  }
  return contradictions;
}

async function evaluateBatch(
  evidence: MemoryEvidence[],
  llm: LLMClient,
): Promise<Contradiction[]> {
  const factsText = evidence
    .map((e, i) => `[${i}] ${e.content}`)
    .join("\n");

  const result = await llmJson(llm, ContradictionSchema, [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Facts:\n${factsText}` },
  ]);

  if (!result.success) return [];

  return result.data.contradictions
    .filter(
      (c) =>
        c.first_index >= 0 &&
        c.first_index < evidence.length &&
        c.second_index >= 0 &&
        c.second_index < evidence.length &&
        c.first_index !== c.second_index,
    )
    .map((c) => ({
      first: evidence[c.first_index],
      second: evidence[c.second_index],
      issue: c.issue,
      severity: c.severity,
    }));
}

/**
 * Detect contradictions between new evidence and existing memories.
 * Useful during memory write to flag potential conflicts.
 */
export async function detectNewContradictions(
  newFact: string,
  existingEvidence: MemoryEvidence[],
  llm: LLMClient,
): Promise<Contradiction[]> {
  const syntheticNew: MemoryEvidence = {
    id: "__new__",
    content: newFact,
    score: 1.0,
    metadata: {},
  };
  const all = [syntheticNew, ...existingEvidence];
  const contradictions = await detectContradictions(all, llm);
  // Only return contradictions involving the new fact
  return contradictions.filter(
    (c) => c.first.id === "__new__" || c.second.id === "__new__",
  );
}
