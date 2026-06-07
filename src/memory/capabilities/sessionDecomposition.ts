/**
 * Session decomposition — extract atomic facts from multi-turn sessions.
 *
 * Pattern: claude-mem (session lifecycle + observation hooks) + OpenViking (ExtractLoop).
 * Delegates memory persistence to MemoryProvider.
 */

import { z } from "zod";
import type { LLMClient } from "../../llm/LLMClient.js";
import { llmJson } from "../../llm/LLMJson.js";
import type { MemoryProvider } from "../../providers/MemoryProvider.js";
import type { SessionEvent, DecomposedFact } from "./types.js";

const DecompositionSchema = z.object({
  facts: z.array(
    z.object({
      content: z.string().min(1),
      confidence: z.number().min(0).max(1),
      source_indices: z.array(z.number()),
      kind: z.enum(["observation", "summary", "manual"]),
    }),
  ),
});

const SYSTEM_PROMPT = `You are a memory extraction system. Given a sequence of session events (messages, tool uses, observations), extract discrete, atomic facts worth remembering for future sessions.

Rules:
- Each fact should be self-contained and understandable without the original context
- Deduplicate: do not emit facts that say the same thing differently
- Confidence: 0.9+ for explicit rules/preferences, 0.6-0.8 for conventions, 0.3-0.5 for observations
- source_indices: which events (0-based) contributed to this fact
- kind: "observation" for tool-use/behavioral patterns, "summary" for high-level takeaways, "manual" for explicit user instructions
- Return at most 20 facts, sorted by confidence descending

Return JSON: { "facts": [ { "content": "...", "confidence": 0.0-1.0, "source_indices": [0,2], "kind": "observation" } ] }`;

export async function decomposeSession(
  events: SessionEvent[],
  llm: LLMClient,
): Promise<DecomposedFact[]> {
  const eventText = events
    .map(
      (e, i) =>
        `[${i}] ${e.type}${e.role ? ` (${e.role})` : ""} @ ${e.timestamp}: ${e.content}`,
    )
    .join("\n");

  const result = await llmJson(llm, DecompositionSchema, [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: eventText },
  ]);

  if (!result.success) return [];

  return result.data.facts.map((f) => ({
    content: f.content,
    confidence: f.confidence,
    source_events: f.source_indices,
    kind: f.kind,
  }));
}

/** Decompose a session and persist the resulting facts. */
export async function decomposeAndPersist(
  events: SessionEvent[],
  sessionId: string,
  llm: LLMClient,
  memory: MemoryProvider,
): Promise<DecomposedFact[]> {
  const facts = await decomposeSession(events, llm);

  for (const fact of facts) {
    await memory.write({
      scope: "session",
      scope_id: sessionId,
      content: fact.content,
      kind: fact.kind,
      metadata: {
        confidence: fact.confidence,
        source_events: fact.source_events,
        decomposed: true,
      },
    });
  }

  return facts;
}
