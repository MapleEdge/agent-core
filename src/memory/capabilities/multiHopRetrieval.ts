/**
 * Multi-hop retrieval — iterative retrieval with LLM-guided follow-up queries.
 *
 * Pattern: OpenViking HierarchicalRetriever (recursive search + convergence) +
 *          cognee GraphCompletionCotRetriever (CoT multi-round retrieval).
 */

import { z } from "zod";
import type { LLMClient } from "../../llm/LLMClient.js";
import { llmJson } from "../../llm/LLMJson.js";
import type { MemoryProvider } from "../../providers/MemoryProvider.js";
import type { MemoryEvidence, HopResult, MultiHopResult } from "./types.js";

const FollowUpSchema = z.object({
  needs_more: z.boolean(),
  follow_up_query: z.string().optional(),
  reasoning: z.string(),
  answer_ready: z.boolean(),
});

export interface MultiHopConfig {
  max_hops: number;
  convergence_threshold: number;
  per_hop_limit: number;
}

const DEFAULT_CONFIG: MultiHopConfig = {
  max_hops: 3,
  convergence_threshold: 0.15,
  per_hop_limit: 5,
};

const HOP_SYSTEM_PROMPT = `You are a retrieval planning system. Given a question and evidence retrieved so far, decide whether more information is needed.

If the current evidence is sufficient to answer the question, set needs_more=false and answer_ready=true.
If more information is needed, set needs_more=true and provide a follow_up_query that would fill the gap.
The follow_up_query should be a new search query targeting the missing information — NOT a repetition of the original query.

Return JSON: { "needs_more": bool, "follow_up_query": "...", "reasoning": "...", "answer_ready": bool }`;

/** Deduplicate evidence by ID, keeping highest-scoring version. */
function deduplicateEvidence(all: MemoryEvidence[]): MemoryEvidence[] {
  const best = new Map<string, MemoryEvidence>();
  for (const e of all) {
    const existing = best.get(e.id);
    if (!existing || e.score > existing.score) {
      best.set(e.id, e);
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/** Check convergence: is the new hop adding significantly new information? */
function hasConverged(
  prevEvidence: MemoryEvidence[],
  newEvidence: MemoryEvidence[],
  threshold: number,
): boolean {
  if (newEvidence.length === 0) return true;
  const prevIds = new Set(prevEvidence.map((e) => e.id));
  const newIds = newEvidence.filter((e) => !prevIds.has(e.id));
  return newIds.length / Math.max(newEvidence.length, 1) < threshold;
}

export async function multiHopRetrieve(
  query: string,
  memory: MemoryProvider,
  llm: LLMClient,
  config: Partial<MultiHopConfig> = {},
): Promise<MultiHopResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const hops: HopResult[] = [];
  let allEvidence: MemoryEvidence[] = [];
  let currentQuery = query;

  for (let hop = 0; hop < cfg.max_hops; hop++) {
    const results = await memory.search({
      query: currentQuery,
      top_k: cfg.per_hop_limit,
    });

    const hopEvidence: MemoryEvidence[] = results.map((r) => ({
      id: r.id,
      content: r.content,
      score: r.score,
      metadata: r.metadata,
    }));

    hops.push({ hop, query: currentQuery, evidence: hopEvidence });

    // Check convergence
    if (hop > 0 && hasConverged(allEvidence, hopEvidence, cfg.convergence_threshold)) {
      break;
    }

    allEvidence = deduplicateEvidence([...allEvidence, ...hopEvidence]);

    // Ask LLM if we need another hop
    if (hop < cfg.max_hops - 1) {
      const evidenceText = allEvidence
        .slice(0, 10)
        .map((e) => `[${e.id}]: ${e.content}`)
        .join("\n");

      const followUp = await llmJson(llm, FollowUpSchema, [
        { role: "system", content: HOP_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Original question: ${query}\n\nEvidence so far:\n${evidenceText}`,
        },
      ]);

      if (!followUp.success || !followUp.data.needs_more || followUp.data.answer_ready) {
        break;
      }

      currentQuery = followUp.data.follow_up_query ?? query;
    }
  }

  const merged = deduplicateEvidence(allEvidence);
  const reasoning = hops
    .map((h) => `Hop ${h.hop}: "${h.query}" → ${h.evidence.length} results`)
    .join("; ");

  return { hops, merged_evidence: merged, reasoning };
}
