/**
 * Shared types for the memory capability layer.
 *
 * These types sit above MemoryProvider and below the API routes.
 * They define the contracts for higher-order memory operations
 * (answer generation, temporal search, abstention, etc.).
 */

export interface MemoryEvidence {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

/** Result of answer generation over retrieved memories. */
export interface AnswerResult {
  answer: string;
  confidence: number;
  evidence: MemoryEvidence[];
  abstained: boolean;
  reasoning?: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  latency_ms: number;
}

/** A single session event for decomposition. */
export interface SessionEvent {
  type: "message" | "tool_use" | "observation" | "summary";
  role?: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/** Decomposed session output — atomic facts extracted from a session. */
export interface DecomposedFact {
  content: string;
  confidence: number;
  source_events: number[];
  kind: "observation" | "summary" | "manual";
}

/** Temporal query parameters. */
export interface TemporalQuery {
  query: string;
  time_from?: string;
  time_to?: string;
  recency_weight?: number;
}

/** Multi-hop retrieval step. */
export interface HopResult {
  hop: number;
  query: string;
  evidence: MemoryEvidence[];
}

/** Multi-hop retrieval result. */
export interface MultiHopResult {
  hops: HopResult[];
  merged_evidence: MemoryEvidence[];
  reasoning: string;
}

/** Knowledge update event. */
export interface KnowledgeUpdate {
  memory_id: string;
  previous_content: string | null;
  current_content: string;
  change_type: "created" | "updated" | "deleted";
  timestamp: string;
}

/** Contradiction between two memories. */
export interface Contradiction {
  first: MemoryEvidence;
  second: MemoryEvidence;
  issue: string;
  severity: number;
}

/** Event with temporal ordering metadata. */
export interface OrderedEvent {
  content: string;
  timestamp: string;
  position: number;
  source_id: string;
}
