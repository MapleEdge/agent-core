/**
 * Event ordering — reconstruct chronological sequence from unordered memories.
 *
 * Pattern: compose from mem0 history() timestamps + claude-mem created_at_epoch ordering.
 * Agent-core owns timeline composition and cross-source aggregation.
 */

import type { MemoryProvider, MemorySearchResult } from "../../providers/MemoryProvider.js";
import type { OrderedEvent, MemoryEvidence, KnowledgeUpdate } from "./types.js";

/**
 * Order memory evidence chronologically by timestamp metadata.
 */
export function orderByTimestamp(evidence: MemoryEvidence[]): OrderedEvent[] {
  const withTimestamps = evidence.map((e) => {
    const ts =
      (e.metadata?.updated_at as string) ??
      (e.metadata?.created_at as string) ??
      (e.metadata?.timestamp as string) ??
      "";
    return { evidence: e, timestamp: ts, parsedTime: ts ? new Date(ts).getTime() : 0 };
  });

  // Sort chronologically (earliest first)
  withTimestamps.sort((a, b) => a.parsedTime - b.parsedTime);

  return withTimestamps.map((w, i) => ({
    content: w.evidence.content,
    timestamp: w.timestamp,
    position: i,
    source_id: w.evidence.id,
  }));
}

/**
 * Order knowledge updates chronologically.
 */
export function orderUpdates(updates: KnowledgeUpdate[]): KnowledgeUpdate[] {
  return [...updates].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

/**
 * Build a timeline from search results, merging duplicates.
 */
export function buildTimeline(results: MemorySearchResult[]): OrderedEvent[] {
  const evidence: MemoryEvidence[] = results.map((r) => ({
    id: r.id,
    content: r.content,
    score: r.score,
    metadata: r.metadata,
  }));

  // Deduplicate by content similarity (exact match)
  const seen = new Map<string, MemoryEvidence>();
  for (const e of evidence) {
    const key = e.content.trim().toLowerCase();
    if (!seen.has(key) || e.score > (seen.get(key)?.score ?? 0)) {
      seen.set(key, e);
    }
  }

  return orderByTimestamp([...seen.values()]);
}

/**
 * Full timeline retrieval: search memories → order chronologically.
 */
export async function retrieveTimeline(
  query: string,
  memory: MemoryProvider,
  options?: { scope?: string; scope_id?: string; limit?: number },
): Promise<OrderedEvent[]> {
  const results = await memory.search({
    query,
    scope: options?.scope,
    scope_id: options?.scope_id,
    top_k: options?.limit ?? 20,
  });
  return buildTimeline(results);
}
