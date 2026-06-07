/**
 * Temporal search — filter and rank memories by time range or recency.
 *
 * Pattern: cognee TemporalRetriever (LLM time extraction) + mem0 metadata filters + OpenViking hotness scoring.
 */

import { z } from "zod";
import type { LLMClient } from "../../llm/LLMClient.js";
import { llmJson } from "../../llm/LLMJson.js";
import type { MemoryProvider, MemorySearchResult } from "../../providers/MemoryProvider.js";
import type { TemporalQuery, MemoryEvidence } from "./types.js";

const TimeExtractionSchema = z.object({
  has_temporal_intent: z.boolean(),
  time_from: z.string().nullable(),
  time_to: z.string().nullable(),
  cleaned_query: z.string(),
});

const TIME_SYSTEM_PROMPT = `Extract temporal intent from a query. If the query references a time period, extract ISO 8601 date strings.

Examples:
- "What did we discuss last week?" → { "has_temporal_intent": true, "time_from": "<7 days ago ISO>", "time_to": "<now ISO>", "cleaned_query": "What did we discuss?" }
- "OAuth login flow" → { "has_temporal_intent": false, "time_from": null, "time_to": null, "cleaned_query": "OAuth login flow" }
- "Changes made in January 2025" → { "has_temporal_intent": true, "time_from": "2025-01-01T00:00:00Z", "time_to": "2025-01-31T23:59:59Z", "cleaned_query": "Changes made" }

Return JSON: { "has_temporal_intent": bool, "time_from": "ISO" or null, "time_to": "ISO" or null, "cleaned_query": "query without temporal phrases" }`;

/** Apply recency boost (OpenViking hotness pattern). */
export function recencyBoost(
  results: MemorySearchResult[],
  weight: number = 0.2,
  halfLifeDays: number = 7,
): MemorySearchResult[] {
  const now = Date.now();
  const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000;

  return results
    .map((r) => {
      const updatedAt = r.metadata?.updated_at
        ? new Date(r.metadata.updated_at as string).getTime()
        : r.metadata?.created_at
          ? new Date(r.metadata.created_at as string).getTime()
          : now;
      const ageMs = now - updatedAt;
      const decay = Math.exp((-Math.LN2 * ageMs) / halfLifeMs);
      const boostedScore = r.score * (1 - weight) + decay * weight;
      return { ...r, score: boostedScore };
    })
    .sort((a, b) => b.score - a.score);
}

/** Extract temporal intent from a natural-language query. */
export async function extractTemporalIntent(
  query: string,
  llm: LLMClient,
  currentTime?: string,
): Promise<{
  has_temporal_intent: boolean;
  time_from: string | null;
  time_to: string | null;
  cleaned_query: string;
}> {
  const now = currentTime ?? new Date().toISOString();
  const result = await llmJson(llm, TimeExtractionSchema, [
    { role: "system", content: TIME_SYSTEM_PROMPT },
    { role: "user", content: `Current time: ${now}\nQuery: ${query}` },
  ]);

  if (!result.success) {
    return { has_temporal_intent: false, time_from: null, time_to: null, cleaned_query: query };
  }

  return result.data;
}

/** Full temporal search: extract time → filter → recency boost. */
export async function temporalSearch(
  params: TemporalQuery,
  memory: MemoryProvider,
  llm?: LLMClient,
): Promise<MemoryEvidence[]> {
  let timeFrom = params.time_from ?? null;
  let timeTo = params.time_to ?? null;
  let query = params.query;

  // LLM-based temporal extraction if no explicit time range
  if (llm && !timeFrom && !timeTo) {
    const temporal = await extractTemporalIntent(query, llm);
    if (temporal.has_temporal_intent) {
      timeFrom = temporal.time_from;
      timeTo = temporal.time_to;
      query = temporal.cleaned_query;
    }
  }

  // Build metadata filters for time range
  const filters: Record<string, unknown> = {};
  if (timeFrom) {
    filters.created_at = { ...(filters.created_at as Record<string, unknown> ?? {}), gte: timeFrom };
  }
  if (timeTo) {
    filters.created_at = { ...(filters.created_at as Record<string, unknown> ?? {}), lte: timeTo };
  }

  const results = await memory.search({
    query,
    filters: Object.keys(filters).length > 0 ? filters : undefined,
    top_k: 20,
  });

  // Apply recency boost
  const boosted = recencyBoost(results, params.recency_weight ?? 0.2);

  return boosted.map((r) => ({
    id: r.id,
    content: r.content,
    score: r.score,
    metadata: r.metadata,
  }));
}
