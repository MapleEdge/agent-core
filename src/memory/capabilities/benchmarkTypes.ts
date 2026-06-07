/**
 * Types for memory benchmark evaluation.
 * Supports LoCoMo, LongMemEval, BEAM benchmark formats.
 */

export interface BenchmarkQuestion {
  id: string;
  question: string;
  gold_answer: string;
  category: string;
  /** Memory entries that should be ingested before querying */
  context_entries?: string[];
  /** Conversation messages to ingest as session context */
  conversation?: Array<{ role: string; content: string }>;
  /** Expected capabilities needed */
  capabilities?: string[];
  /** Difficulty tier */
  difficulty?: "easy" | "medium" | "hard";
}

export interface BenchmarkSuite {
  name: string;
  version: string;
  description: string;
  questions: BenchmarkQuestion[];
  target_metrics: BenchmarkTargets;
}

export interface BenchmarkTargets {
  accuracy: number;
  tokens_budget?: number;
  latency_p50_ms?: number;
}

export interface QuestionResult {
  id: string;
  question: string;
  gold_answer: string;
  predicted_answer: string;
  correct: boolean;
  abstained: boolean;
  confidence: number;
  latency_ms: number;
  tokens_used: number;
  category: string;
}

export interface BenchmarkReport {
  suite: string;
  timestamp: string;
  accuracy: number;
  accuracy_by_category: Record<string, number>;
  abstention_rate: number;
  mean_confidence: number;
  total_tokens: number;
  mean_tokens_per_question: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  latency_p99_ms: number;
  targets: BenchmarkTargets;
  passed: boolean;
  results: QuestionResult[];
}
