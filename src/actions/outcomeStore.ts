/**
 * ActionOutcomeStore — SQLite-backed persistence for action outcomes.
 *
 * Records what the platform (jubilant-goggles) actually executed, enabling:
 *   - Outcome-based action recommendations
 *   - Success/failure statistics per action
 *   - Procedural memory extraction from repeated patterns
 *
 * Reference: cognee execute_tool trace, claude-mem session events
 */

import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db.js";
import type { ActionOutcomeRecord, StoredOutcome } from "../providers/ActionKnowledgeProvider.js";

interface OutcomeRow {
  id: string;
  session_id: string;
  action_name: string;
  params: string;
  status: string;
  output: string;
  duration_ms: number;
  executor: string;
  rationale: string | null;
  error: string | null;
  files_touched: string | null;
  test_result: string | null;
  created_at: string;
}

function toStoredOutcome(row: OutcomeRow): StoredOutcome {
  return {
    id: row.id,
    session_id: row.session_id,
    action_name: row.action_name,
    params: JSON.parse(row.params) as Record<string, unknown>,
    status: row.status as StoredOutcome["status"],
    output: JSON.parse(row.output) as Record<string, unknown>,
    duration_ms: row.duration_ms,
    executor: row.executor,
    rationale: row.rationale ?? undefined,
    error: row.error ?? undefined,
    files_touched: row.files_touched ? JSON.parse(row.files_touched) as string[] : undefined,
    test_result: row.test_result ?? undefined,
    created_at: row.created_at,
  };
}

export function ensureOutcomeTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS action_outcomes (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      action_name TEXT NOT NULL,
      params TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL,
      output TEXT NOT NULL DEFAULT '{}',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      executor TEXT NOT NULL DEFAULT 'unknown',
      rationale TEXT,
      error TEXT,
      files_touched TEXT,
      test_result TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_outcomes_session ON action_outcomes(session_id);
    CREATE INDEX IF NOT EXISTS idx_outcomes_action ON action_outcomes(action_name);
    CREATE INDEX IF NOT EXISTS idx_outcomes_status ON action_outcomes(status);
  `);
}

export function insertOutcome(outcome: ActionOutcomeRecord): StoredOutcome {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO action_outcomes
     (id, session_id, action_name, params, status, output, duration_ms, executor, rationale, error, files_touched, test_result, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    outcome.session_id,
    outcome.action_name,
    JSON.stringify(outcome.params),
    outcome.status,
    JSON.stringify(outcome.output),
    outcome.duration_ms,
    outcome.executor,
    outcome.rationale ?? null,
    outcome.error ?? null,
    outcome.files_touched ? JSON.stringify(outcome.files_touched) : null,
    outcome.test_result ?? null,
    now,
  );

  return {
    ...outcome,
    id,
    created_at: now,
  };
}

export function getOutcomesBySession(sessionId: string): StoredOutcome[] {
  const rows = getDb()
    .prepare("SELECT * FROM action_outcomes WHERE session_id = ? ORDER BY created_at ASC")
    .all(sessionId) as OutcomeRow[];
  return rows.map(toStoredOutcome);
}

export function getOutcomesByAction(actionName: string): StoredOutcome[] {
  const rows = getDb()
    .prepare("SELECT * FROM action_outcomes WHERE action_name = ? ORDER BY created_at DESC LIMIT 100")
    .all(actionName) as OutcomeRow[];
  return rows.map(toStoredOutcome);
}

export function getActionStats(actionName: string): {
  total: number;
  succeeded: number;
  failed: number;
  blocked: number;
  avg_duration_ms: number;
} {
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(*) as total,
         COALESCE(SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END), 0) as succeeded,
         COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed,
         COALESCE(SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END), 0) as blocked,
         COALESCE(AVG(duration_ms), 0) as avg_duration_ms
       FROM action_outcomes
       WHERE action_name = ?`,
    )
    .get(actionName) as { total: number; succeeded: number; failed: number; blocked: number; avg_duration_ms: number };

  return {
    total: row.total,
    succeeded: row.succeeded,
    failed: row.failed,
    blocked: row.blocked,
    avg_duration_ms: Math.round(row.avg_duration_ms),
  };
}
