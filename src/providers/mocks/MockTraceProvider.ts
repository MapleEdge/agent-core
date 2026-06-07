import { v4 as uuidv4 } from "uuid";
import { getDb } from "../../db.js";
import type { TraceProvider, TraceRecord } from "../TraceProvider.js";
import type { ProviderStatus } from "../registry.js";

interface TraceRow {
  id: string;
  session_id: string;
  trace_type: "tool-call" | "skill-run";
  action_name: string | null;
  input: string;
  output: string;
  duration_ms: number | null;
  created_at: string;
}

export class MockTraceProvider implements TraceProvider {
  readonly name = "mock-trace";
  readonly status: ProviderStatus = "mock";

  async recordToolCall(
    session_id: string,
    action_name: string,
    input: Record<string, unknown>,
    output: Record<string, unknown>,
    duration_ms?: number,
  ): Promise<TraceRecord> {
    return this.record("tool-call", session_id, action_name, input, output, duration_ms);
  }

  async recordSkillRun(
    session_id: string,
    skill_name: string,
    input: Record<string, unknown>,
    output: Record<string, unknown>,
    duration_ms?: number,
  ): Promise<TraceRecord> {
    return this.record("skill-run", session_id, skill_name, input, output, duration_ms);
  }

  async getBySession(session_id: string): Promise<TraceRecord[]> {
    const rows = getDb()
      .prepare("SELECT * FROM traces WHERE session_id = ? ORDER BY created_at ASC")
      .all(session_id) as TraceRow[];
    return rows.map((row) => this.mapTrace(row));
  }

  private record(
    trace_type: "tool-call" | "skill-run",
    session_id: string,
    action_name: string,
    input: Record<string, unknown>,
    output: Record<string, unknown>,
    duration_ms?: number,
  ): TraceRecord {
    const id = uuidv4();
    const db = getDb();
    db.prepare(
      "INSERT INTO traces (id, session_id, trace_type, action_name, input, output, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      session_id,
      trace_type,
      action_name,
      JSON.stringify(input),
      JSON.stringify(output),
      duration_ms ?? null,
    );
    const row = db.prepare("SELECT * FROM traces WHERE id = ?").get(id) as TraceRow | undefined;
    if (!row) throw new Error(`Failed to create trace "${id}"`);
    return this.mapTrace(row);
  }

  private mapTrace(row: TraceRow): TraceRecord {
    return {
      id: row.id,
      session_id: row.session_id,
      trace_type: row.trace_type,
      action_name: row.action_name,
      input: this.parseRecord(row.input),
      output: this.parseRecord(row.output),
      duration_ms: row.duration_ms,
      created_at: row.created_at,
    };
  }

  private parseRecord(value: string): Record<string, unknown> {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  }
}
