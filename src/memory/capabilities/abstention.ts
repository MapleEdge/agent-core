/**
 * Abstention gate — refuse to answer when evidence is insufficient or contradictory.
 *
 * Native implementation — no reference system has retrieval-confidence-based abstention.
 * Closest pattern: Parlant's guideline applicability checks (skip response when conditions unmet).
 */

import type { MemoryEvidence, Contradiction } from "./types.js";

export interface AbstentionPolicy {
  min_confidence: number;
  min_evidence_count: number;
  max_contradiction_severity: number;
  max_score_variance: number;
}

export const DEFAULT_ABSTENTION_POLICY: AbstentionPolicy = {
  min_confidence: 0.3,
  min_evidence_count: 1,
  max_contradiction_severity: 0.7,
  max_score_variance: 0.8,
};

export interface AbstentionResult {
  should_abstain: boolean;
  reasons: string[];
  evidence_quality: {
    count: number;
    mean_score: number;
    max_score: number;
    variance: number;
    has_contradictions: boolean;
  };
}

/**
 * Evaluate whether to abstain from answering based on evidence quality.
 */
export function evaluateAbstention(
  evidence: MemoryEvidence[],
  contradictions: Contradiction[],
  policy: Partial<AbstentionPolicy> = {},
): AbstentionResult {
  const p = { ...DEFAULT_ABSTENTION_POLICY, ...policy };
  const reasons: string[] = [];

  // Evidence count check
  if (evidence.length < p.min_evidence_count) {
    reasons.push(
      `Insufficient evidence: ${evidence.length} < ${p.min_evidence_count}`,
    );
  }

  // Score analysis
  const scores = evidence.map((e) => e.score);
  const meanScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0;

  // Variance check — high variance means evidence quality is inconsistent
  const variance =
    scores.length > 1
      ? scores.reduce((sum, s) => sum + (s - meanScore) ** 2, 0) / scores.length
      : 0;

  if (meanScore < p.min_confidence) {
    reasons.push(
      `Low mean confidence: ${meanScore.toFixed(3)} < ${p.min_confidence}`,
    );
  }

  if (variance > p.max_score_variance) {
    reasons.push(
      `High score variance: ${variance.toFixed(3)} > ${p.max_score_variance}`,
    );
  }

  // Contradiction check
  const severeContradictions = contradictions.filter(
    (c) => c.severity > p.max_contradiction_severity,
  );
  if (severeContradictions.length > 0) {
    reasons.push(
      `${severeContradictions.length} severe contradiction(s) detected`,
    );
  }

  return {
    should_abstain: reasons.length > 0,
    reasons,
    evidence_quality: {
      count: evidence.length,
      mean_score: meanScore,
      max_score: maxScore,
      variance,
      has_contradictions: contradictions.length > 0,
    },
  };
}
