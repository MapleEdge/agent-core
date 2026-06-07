# Long-Memory Benchmark Roadmap

## Current Gates (Sprint 2)

agent-core gates on these metrics today:

```text
Recall@1, Recall@3, Recall@5
MRR
nDCG@5
latency p50/p95/p99
metadata filtering correctness
FTS fallback correctness
hybrid retrieval correctness (BM25 + vector merge)
```

These are measured via `pnpm memory:eval` against 17 golden fixtures across 6 categories (semantic synonyms, paraphrases, coding concepts, abbreviations, error messages, repository memories).

The benchmarks below are **not gated in CI today**. This document evaluates when each should become a required gate.

---

## Benchmark Evaluations

### 1. LoCoMo

**Paper:** Maharana et al., "Evaluating Very Long-Term Conversational Memory of LLM Agents" (ACL 2024)
**Source:** https://github.com/snap-research/locomo
**Dataset:** `data/locomo10.json` — 10 conversations, ~300 turns / ~9K tokens each, up to 35 sessions

#### What it measures

```text
1. Question answering over long conversations
   - Single-hop: answer from one session
   - Multi-hop: synthesize across multiple sessions
   - Temporal reasoning: time-dependent questions
   - Open-domain knowledge: world knowledge + conversation context
   - Adversarial: questions designed to trigger hallucination

2. Event summarization
   - Extract significant events per speaker per session
   - Evaluate long-range causal and temporal connections

3. Multimodal dialog generation (not applicable to agent-core)
```

#### Required dataset format

```json
{
  "conversation": {
    "session_1": [...turns...],
    "session_1_date_time": "2023-01-15 10:00:00",
    "speaker_a": "Alice",
    "speaker_b": "Bob"
  },
  "qa_pairs": [
    {
      "question": "...",
      "answer": "...",
      "category": 1,
      "evidence_session": "session_3"
    }
  ],
  "event_summary": {
    "events_session_1": [...]
  }
}
```

#### Required memory capabilities

```text
- Multi-session conversation storage
- Session-aware retrieval (which session contains the answer)
- Temporal reasoning (ordering, recency, duration)
- Multi-hop retrieval (synthesize across sessions)
- Adversarial robustness (abstention when answer doesn't exist)
- Event extraction and summarization
```

#### Missing agent-core capabilities

```text
- LLM-driven memory extraction (mem0 provides this, but not native)
- Session-aware retrieval scoping (partial — scope/scope_id exists)
- Multi-hop retrieval (no cross-memory synthesis)
- Temporal reasoning (no timestamp-aware search)
- Event extraction and summarization (not implemented)
- Answer generation over retrieved memories (no LLM reader stage)
- Adversarial abstention (no confidence thresholding for "I don't know")
```

#### Estimated implementation effort

```text
Adapter to load LoCoMo JSON into agent-core memories: 1-2 days
QA evaluation harness (F1 scoring per category):     2-3 days
Missing capabilities for meaningful scores:           2-4 sprints
```

#### Classification: **partially runnable**

We can load conversations and run single-hop retrieval today. Multi-hop, temporal, and adversarial categories require capabilities we don't have. Running the benchmark now would produce very low scores that don't reflect retrieval quality — they reflect missing higher-order capabilities.

#### CI gate recommendation: **not now**

Gate after: memory extraction, session summarization, temporal-aware search, answer generation.

---

### 2. LongMemEval

**Paper:** Du et al., "LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory" (ICLR 2025)
**Source:** https://github.com/xiaowu0162/LongMemEval
**Dataset:** 500 human-curated questions, two scales:
- LongMemEvalS: ~115K tokens (30-40 sessions) per question
- LongMemEvalM: ~1.5M tokens (~500 sessions) per question

#### What it measures

Five core long-term memory abilities:

```text
1. Information Extraction
   - Recall specific details from user or assistant messages
   - Single-session-user, single-session-assistant, single-session-preference

2. Multi-Session Reasoning
   - Synthesize information across multiple sessions
   - Aggregation, comparison, counting across history

3. Knowledge Updates
   - Recognize changes in user preferences/information over time
   - Track evolving facts (e.g., "I moved from NYC to SF last month")

4. Temporal Reasoning
   - Explicit time mentions ("last Tuesday")
   - Timestamp metadata awareness
   - Chronological ordering of events

5. Abstention
   - Correctly refuse to answer when information is not in history
   - Detect unanswerable questions
```

#### Required dataset format

```json
{
  "question_id": "q001",
  "question_type": "single-session-user",
  "question": "What programming language did I say I was learning?",
  "answer": "Rust",
  "question_date": "2024-03-15",
  "haystack_session_ids": ["s001", "s002", ...],
  "haystack_sessions": [[{"role": "user", "content": "..."}, ...], ...],
  "answer_session_ids": ["s005"],
  "abstention_question": false
}
```

#### Required memory capabilities

```text
- Large-scale memory storage (115K–1.5M tokens of conversation history)
- Session decomposition and indexing
- Fact extraction from conversations
- Preference tracking (user likes/dislikes)
- Knowledge update detection (contradictions, corrections)
- Temporal metadata indexing and search
- Abstention / confidence calibration
- Multi-session cross-referencing
```

#### Missing agent-core capabilities

```text
- Memory extraction from conversations (need LLM extraction pipeline)
- Session decomposition (no automatic session → memory conversion)
- Knowledge update / conflict detection (no dedup or contradiction resolver)
- Temporal metadata search (no timestamp-aware retrieval)
- Abstention mechanism (no confidence thresholding)
- Scale: 1.5M tokens requires efficient indexing (brute-force won't scale)
- Answer generation (need LLM reader after retrieval)
```

#### Estimated implementation effort

```text
Adapter to load LongMemEval format:              1-2 days
Session decomposition pipeline:                    1 sprint
Memory extraction from conversations:              1 sprint (or use mem0)
Knowledge update detection:                        1-2 sprints
Temporal-aware search:                             1 sprint
Abstention mechanism:                              1 sprint
Answer generation (LLM reader):                    1 sprint
End-to-end integration:                            1 sprint
Total for full support:                            4-8 sprints
```

#### Classification: **not yet applicable**

LongMemEval tests end-to-end chat assistant memory — from raw conversations through extraction, indexing, retrieval, to answer generation. agent-core currently has the retrieval and storage layers but lacks the extraction-to-answer pipeline. Running this benchmark now would test capabilities we haven't built yet.

#### CI gate recommendation: **not now**

Gate after: memory extraction, knowledge update detection, temporal search, abstention, answer generation pipeline. LongMemEvalS should be gated first (smaller scale), then LongMemEvalM when indexing scales to 1.5M tokens.

---

### 3. BEAM (128K / 500K / 1M / 10M)

**Paper:** Tavakoli et al., "Beyond a Million Tokens: Benchmarking and Enhancing Long-Term Memory in LLMs" (2025)
**Source:** https://huggingface.co/datasets/Mohammadta/BEAM (and Mohammadta/BEAM-10M)
**Dataset:** 100 conversations, 2,000 validated probing questions across 4 scales (128K, 500K, 1M, 10M tokens)

#### What it measures

Ten distinct memory abilities:

```text
 1. Single Detail Recall     — retrieve a specific fact from one location
 2. Broad Knowledge Recall   — aggregate information across the conversation
 3. Contextual Understanding — interpret meaning using surrounding context
 4. Temporal Awareness        — track time-dependent information
 5. Contradiction Detection   — identify conflicting statements
 6. Information Evolution     — track how facts change over time
 7. Conversation Dynamics     — understand speaker roles, tone shifts
 8. Instruction Following     — recall and apply instructions from earlier turns (new)
 9. Event Ordering            — arrange events in chronological order (new)
10. Counterfactual Reasoning  — reason about hypothetical scenarios (new)
```

#### Required dataset format

```json
{
  "category": "general",
  "title": "Career Development Journey",
  "theme": "...",
  "subtopics": ["..."],
  "narratives": ["..."],
  "conversation_plan": "...",
  "user_questions": ["..."],
  "chat_data": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ],
  "probing_questions": [
    {
      "type": "single_detail_recall",
      "question": "...",
      "answer": "...",
      "evidence_turns": [42, 43]
    }
  ]
}
```

#### Required memory capabilities

```text
- Massive scale storage and retrieval (up to 10M tokens)
- Efficient indexing (brute-force scan infeasible at 10M tokens)
- All 10 abilities above — most requiring LLM reasoning, not just retrieval
- Contradiction detection (requires comparing retrieved memories)
- Counterfactual reasoning (requires inference, not just recall)
- Event ordering (requires temporal indexing)
- Instruction tracking (requires extracting and persisting instructions)
```

#### Missing agent-core capabilities

```text
- Scale: 10M tokens far exceeds current SQLite brute-force capacity
- LLM-based answer generation (all BEAM questions require natural language answers)
- Contradiction detection (no implementation)
- Counterfactual reasoning (requires chain-of-thought over memories)
- Information evolution tracking (no memory versioning or history)
- Instruction extraction and persistence (not implemented)
- Event ordering (no temporal index)
- Conversation dynamics analysis (no speaker modeling)
```

#### Estimated implementation effort

```text
BEAM-128K adapter (load + basic retrieval eval):    2-3 days
Answer generation pipeline:                          1 sprint
Scale to 1M tokens (ANN indexing needed):            2 sprints
Scale to 10M tokens:                                 3+ sprints
Full 10-ability support:                             6-10 sprints
```

#### Classification: **not yet applicable**

BEAM is the most demanding of the four benchmarks. Even the 128K scale requires answer generation capabilities we don't have. The 1M and 10M scales additionally require indexing infrastructure beyond SQLite brute-force. This is a long-term target.

#### CI gate recommendation: **not now**

Phased approach:
1. Gate BEAM-128K after answer generation pipeline + ANN indexing
2. Gate BEAM-1M after scaling indexing to 1M tokens
3. BEAM-10M is a research-grade target — evaluate feasibility after 1M works

---

## Summary Matrix

| Benchmark | Classification | CI Gate Now? | Gate After |
|-----------|---------------|-------------|------------|
| **LoCoMo** | Partially runnable | No | Memory extraction, session summarization, temporal search, answer generation |
| **LongMemEval** | Not yet applicable | No | Memory extraction, knowledge updates, temporal search, abstention, answer generation |
| **BEAM 128K** | Not yet applicable | No | Answer generation pipeline, basic ANN indexing |
| **BEAM 1M** | Not yet applicable | No | Scaled ANN indexing (1M tokens) |
| **BEAM 10M** | Not yet applicable | No | Research-grade target; evaluate after 1M |

## Current CI Gates (unchanged)

Sprint 2 continues to gate on:

```text
✓ Recall@1, Recall@3, Recall@5
✓ MRR, nDCG@5
✓ Latency p50/p95/p99
✓ Metadata filtering correctness
✓ FTS fallback correctness
✓ Hybrid retrieval correctness
```

These metrics test the retrieval substrate — the component agent-core actually owns today.

## Recommended Gate Sequence

```text
Phase 1 (current — Sprint 2):
  Recall@1/3/5, MRR, nDCG, latency, metadata, FTS, hybrid

Phase 2 (after memory extraction + answer generation):
  LoCoMo single-hop QA (F1)
  LoCoMo adversarial abstention
  LongMemEval information extraction subset

Phase 3 (after temporal search + knowledge updates):
  LoCoMo temporal QA
  LongMemEval temporal reasoning
  LongMemEval knowledge updates

Phase 4 (after multi-hop retrieval + session summarization):
  LoCoMo multi-hop QA
  LoCoMo event summarization
  LongMemEval multi-session reasoning
  BEAM-128K (all 10 abilities)

Phase 5 (after ANN indexing at scale):
  LongMemEvalS (115K tokens)
  BEAM-1M

Phase 6 (research target):
  LongMemEvalM (1.5M tokens)
  BEAM-10M
```

## Prerequisite Capabilities

The following capabilities must be implemented before long-memory benchmarks become meaningful:

| Capability | Required By | Sprint Estimate |
|-----------|-------------|-----------------|
| LLM-driven memory extraction | LoCoMo, LongMemEval, BEAM | 1 sprint (or delegate to mem0) |
| Session decomposition | LongMemEval | 1 sprint |
| Answer generation (LLM reader) | All four benchmarks | 1 sprint |
| Temporal-aware search | LoCoMo, LongMemEval, BEAM | 1 sprint |
| Knowledge update detection | LongMemEval, BEAM | 1-2 sprints |
| Abstention / confidence calibration | LongMemEval, LoCoMo | 1 sprint |
| Memory deduplication | LoCoMo, LongMemEval | 1 sprint (or delegate to mem0) |
| Multi-hop retrieval | LoCoMo, LongMemEval, BEAM | 1-2 sprints |
| ANN indexing (replace brute-force) | BEAM-1M, LongMemEvalM | 2 sprints |
| Contradiction detection | BEAM | 1-2 sprints |
| Event ordering / temporal index | BEAM | 1 sprint |

## References

- LoCoMo: https://github.com/snap-research/locomo (ACL 2024)
- LongMemEval: https://github.com/xiaowu0162/LongMemEval (ICLR 2025)
- BEAM: https://huggingface.co/datasets/Mohammadta/BEAM (2025)
- BEAM paper: https://arxiv.org/abs/2510.27246
