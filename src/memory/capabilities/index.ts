export type {
  MemoryEvidence,
  AnswerResult,
  SessionEvent,
  DecomposedFact,
  TemporalQuery,
  HopResult,
  MultiHopResult,
  KnowledgeUpdate,
  Contradiction,
  OrderedEvent,
} from "./types.js";

export { decomposeSession, decomposeAndPersist } from "./sessionDecomposition.js";
export { generateAnswer, searchAndAnswer } from "./answerGeneration.js";
export type { AnswerGenerationConfig } from "./answerGeneration.js";
export { temporalSearch, extractTemporalIntent, recencyBoost } from "./temporalSearch.js";
export { multiHopRetrieve } from "./multiHopRetrieval.js";
export type { MultiHopConfig } from "./multiHopRetrieval.js";
export { getMemoryHistory, hasUpdatedSince, trackUpdate } from "./knowledgeUpdateTracking.js";
export { evaluateAbstention, DEFAULT_ABSTENTION_POLICY } from "./abstention.js";
export type { AbstentionPolicy, AbstentionResult } from "./abstention.js";
export { detectContradictions, detectNewContradictions } from "./contradictionDetection.js";
export { orderByTimestamp, orderUpdates, buildTimeline, retrieveTimeline } from "./eventOrdering.js";
