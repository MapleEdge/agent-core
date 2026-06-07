# Benchmark & Parity Methodology

## Overview

The action subsystem benchmark suite provides objective, repeatable evidence that the Action pipeline matches or exceeds the behavior of reference implementations from Letta and cognee, while adding auditability, timeline visibility, and rationale transparency.

## Reference Implementations

| Capability | Reference Provider | Our Implementation |
|---|---|---|
| Action registry & schemas | Letta `tool_manager.py` | `ActionProvider` + Zod schemas |
| Tool sequencing | Letta `tool_rule_solver.py` | `LettaRuleSolverProvider` |
| Approval-required actions | Letta `ToolRule.RequiresApproval` | Pipeline permission stage |
| Scoped tool permissions | cognee `execute_tool.py` | Pipeline scope stage |
| Execution traces | cognee `AgenticRetriever` | `ActionAuditRecord` + timeline |
| Skill/action auditability | cognee tool-call records | Durable SQLite audit trail |

## Test Structure

```
tests/
├── fixtures/           # Golden fixture data + reusable runner
│   ├── action-validation.json
│   ├── action-permissions.json
│   ├── action-audit.json
│   ├── action-rationale.json
│   ├── action-failure.json
│   └── runner.ts
├── parity/             # Correctness & safety tests
│   ├── schema-validation.test.ts
│   ├── permission-boundary.test.ts
│   ├── audit-completeness.test.ts
│   ├── timeline-integrity.test.ts
│   ├── rationale-safety.test.ts
│   ├── fault-injection.test.ts
│   └── mutation.test.ts
└── performance/        # Load & latency tests
    ├── concurrency.test.ts
    └── benchmarks.test.ts
```

## Running

```bash
# All tests (including existing + parity + performance)
pnpm test

# Parity tests only
pnpm test:parity

# Performance tests only
pnpm test:perf

# Full parity report (JSON output)
pnpm parity-report
```

## Parity Categories

### 1. Schema Validation Parity
**Question:** Can invalid actions reach execution?

Tests safeParse() with: valid payloads, missing fields, wrong types, null values, unknown actions, optional params.

**Metric:** 100% invalid payloads blocked, 0 invalid payloads invoked.

### 2. Permission Enforcement
**Question:** Can unauthorized actions execute?

Tests: allowed actions, denied actions, scope enforcement, approval gates, destructive action blocking.

**Metric:** 0 unauthorized executions.

### 3. Audit Completeness
**Question:** Are audit trails complete?

Tests status transitions: `requested → validated → executed`, `requested → failed` for each failure mode. Verifies input/output/error capture, session association, timestamps.

**Metric:** 100% action attempts audited, 0 orphan executions.

### 4. Timeline Integrity
**Question:** Are timelines truthful?

Tests: correct event sequence (REQUESTED → VALIDATED → EXECUTED), audit reference integrity, rationale persistence, session isolation.

### 5. Rationale Safety
**Question:** Does rationale survive the entire pipeline?

Tests: persistence in audit record, timeline event, API response. Validates safe format ("Since the user wants X, thus I am Y to Z").

### 6. Fault Injection
**Question:** Does the system fail safely?

Injects failures at every stage (validation, permission, lookup, scope). Verifies fail-closed behavior.

**Metric:** 0 unsafe fall-through paths.

### 7. Mutation Testing
**Question:** Are safety checks actually effective?

Simulates removing: safeParse(), permission check, audit creation, rationale persistence, unknown action rejection, approval gate.

**Metric:** mutation score > 90%.

### 8. Concurrency
**Question:** Does the system handle parallel load?

Runs 100 concurrent validations, 100 concurrent audits, 100 concurrent timeline writes, multi-session isolation.

**Metric:** 0 data corruption.

### 9. Performance Benchmarks
**Question:** Does performance remain acceptable?

Measures validation, pipeline, audit, and timeline latency at 10/100/1000 operations.

**Targets:**
- Validation p95 < 5ms
- Pipeline overhead p95 < 50ms
- 1000 operations < 30s

Machine-readable output: `benchmark-results.json`

## CI Integration

The CI workflow runs parity and performance tests after the main test suite. Benchmark results are uploaded as artifacts.

## Parity Report

`pnpm parity-report` produces `parity-report.json`:

```json
{
  "timestamp": "2026-06-06T...",
  "overall": "PASS",
  "categories": [
    { "name": "Schema Validation", "status": "PASS", "tests": 15, "failures": 0 },
    ...
  ],
  "benchmarks": { ... }
}
```
