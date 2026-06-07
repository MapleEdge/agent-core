/**
 * Action audit records.
 *
 * Durable record of every action execution attempt: who requested it,
 * what was validated, what executed, and what failed. Persisted in SQLite.
 */

import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db.js";

export type AuditStatus = "requested" | "validated" | "executed" | "failed";

export interface ActionAuditRecord {
  id: string;
  session_id: string | null;
  user_id: string | null;
  action_name: string;
  status: AuditStatus;
  rationale: string | null;
  input: unknown;
  output: unknown | null;
  error: unknown | null;
  started_at: string;
  completed_at: string | null;
}

interface AuditRow {
  id: string;
  session_id: string | null;
  user_id: string | null;
  action_name: string;
  status: string;
  rationale: string | null;
  input: string;
  output: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

function toRecord(row: AuditRow): ActionAuditRecord {
  return {
    id: row.id,
    session_id: row.session_id,
    user_id: row.user_id,
    action_name: row.action_name,
    status: row.status as AuditStatus,
    rationale: row.rationale,
    input: JSON.parse(row.input),
    output: row.output ? JSON.parse(row.output) : null,
    error: row.error ? JSON.parse(row.error) : null,
    started_at: row.started_at,
    completed_at: row.completed_at,
  };
}

export function createAuditRecord(params: {
  session_id?: string;
  user_id?: string;
  action_name: string;
  status: AuditStatus;
  rationale?: string;
  input: unknown;
  output?: unknown;
  error?: unknown;
}): ActionAuditRecord {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO action_audits
     (id, session_id, user_id, action_name, status, rationale, input, output, error, started_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.session_id ?? null,
    params.user_id ?? null,
    params.action_name,
    params.status,
    params.rationale ?? null,
    JSON.stringify(params.input ?? {}),
    params.output !== undefined ? JSON.stringify(params.output) : null,
    params.error !== undefined ? JSON.stringify(params.error) : null,
    now,
    params.status === "executed" || params.status === "failed" ? now : null,
  );
  return {
    id,
    session_id: params.session_id ?? null,
    user_id: params.user_id ?? null,
    action_name: params.action_name,
    status: params.status,
    rationale: params.rationale ?? null,
    input: params.input ?? {},
    output: params.output ?? null,
    error: params.error ?? null,
    started_at: now,
    completed_at: params.status === "executed" || params.status === "failed" ? now : null,
  };
}

export function updateAuditRecord(
  id: string,
  update: {
    status: AuditStatus;
    output?: unknown;
    error?: unknown;
  },
): ActionAuditRecord | null {
  const db = getDb();
  const now = new Date().toISOString();
  const sets: string[] = ["status = ?", "completed_at = ?"];
  const values: unknown[] = [update.status, now];

  if (update.output !== undefined) {
    sets.push("output = ?");
    values.push(JSON.stringify(update.output));
  }
  if (update.error !== undefined) {
    sets.push("error = ?");
    values.push(JSON.stringify(update.error));
  }

  values.push(id);
  db.prepare(`UPDATE action_audits SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  return getAuditRecord(id);
}

export function getAuditRecord(id: string): ActionAuditRecord | null {
  const row = getDb()
    .prepare("SELECT * FROM action_audits WHERE id = ?")
    .get(id) as AuditRow | undefined;
  return row ? toRecord(row) : null;
}

export function listAuditRecords(opts?: {
  session_id?: string;
  action_name?: string;
  status?: string;
  limit?: number;
}): ActionAuditRecord[] {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (opts?.session_id) {
    conditions.push("session_id = ?");
    values.push(opts.session_id);
  }
  if (opts?.action_name) {
    conditions.push("action_name = ?");
    values.push(opts.action_name);
  }
  if (opts?.status) {
    conditions.push("status = ?");
    values.push(opts.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = opts?.limit ?? 100;

  const rows = getDb()
    .prepare(`SELECT * FROM action_audits ${where} ORDER BY started_at DESC LIMIT ?`)
    .all(...values, limit) as AuditRow[];

  return rows.map(toRecord);
}
