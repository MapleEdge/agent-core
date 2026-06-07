import { v4 as uuidv4 } from "uuid";
import { getDb } from "../../db.js";
import type {
  SessionProvider,
  SessionRecord,
  SessionEvent,
  TimelineItem,
} from "../SessionProvider.js";
import type { ProviderStatus } from "../registry.js";

interface SessionRow {
  id: string;
  repo_id: string | null;
  status: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

interface SessionEventRow {
  id: string;
  session_id: string;
  event_type: string;
  data: string;
  created_at: string;
}

interface TraceRow {
  id: string;
  trace_type: "tool-call" | "skill-run";
  action_name: string | null;
  input: string;
  output: string;
  duration_ms: number | null;
  created_at: string;
}

export class MockSessionProvider implements SessionProvider {
  readonly name = "mock-session";
  readonly status: ProviderStatus = "mock";

  async create(repo_id?: string): Promise<SessionRecord> {
    const id = uuidv4();
    const db = getDb();
    db.prepare("INSERT INTO sessions (id, repo_id) VALUES (?, ?)").run(id, repo_id ?? null);
    const created = await this.get(id);
    if (!created) throw new Error(`Failed to create session "${id}"`);
    return created;
  }

  async get(id: string): Promise<SessionRecord | null> {
    const row = getDb().prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
    return row ?? null;
  }

  async list(opts?: { status?: string; repo_id?: string; limit?: number }): Promise<SessionRecord[]> {
    const db = getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (opts?.status) {
      conditions.push("status = ?");
      params.push(opts.status);
    }
    if (opts?.repo_id) {
      conditions.push("repo_id = ?");
      params.push(opts.repo_id);
    }
    const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
    const limit = opts?.limit ?? 50;
    const rows = db
      .prepare(`SELECT * FROM sessions${where} ORDER BY created_at DESC LIMIT ?`)
      .all(...params, limit) as SessionRow[];
    return rows;
  }

  async close(id: string, summary?: string): Promise<SessionRecord | null> {
    const db = getDb();
    if (summary) {
      db.prepare(
        "UPDATE sessions SET status = 'closed', summary = ?, updated_at = datetime('now') WHERE id = ?",
      ).run(summary, id);
    } else {
      db.prepare(
        "UPDATE sessions SET status = 'closed', updated_at = datetime('now') WHERE id = ?",
      ).run(id);
    }
    return this.get(id);
  }

  async delete(id: string): Promise<boolean> {
    const db = getDb();
    db.prepare("DELETE FROM session_events WHERE session_id = ?").run(id);
    db.prepare("DELETE FROM traces WHERE session_id = ?").run(id);
    const result = db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return result.changes > 0;
  }

  async addEvent(
    session_id: string,
    event_type: string,
    data: Record<string, unknown>,
  ): Promise<SessionEvent> {
    const id = uuidv4();
    const db = getDb();
    db.prepare("INSERT INTO session_events (id, session_id, event_type, data) VALUES (?, ?, ?, ?)").run(
      id,
      session_id,
      event_type,
      JSON.stringify(data),
    );
    const row = db.prepare("SELECT * FROM session_events WHERE id = ?").get(id) as SessionEventRow | undefined;
    if (!row) throw new Error(`Failed to create session event "${id}"`);
    return this.mapEvent(row);
  }

  async getTimeline(session_id: string): Promise<TimelineItem[]> {
    const db = getDb();
    const events = db
      .prepare("SELECT * FROM session_events WHERE session_id = ?")
      .all(session_id) as SessionEventRow[];
    const traces = db
      .prepare("SELECT * FROM traces WHERE session_id = ?")
      .all(session_id) as TraceRow[];

    return [
      ...events.map((event) => ({
        type: "event" as const,
        id: event.id,
        timestamp: event.created_at,
        data: {
          event_type: event.event_type,
          ...this.parseRecord(event.data),
        },
      })),
      ...traces.map((trace) => ({
        type: "trace" as const,
        id: trace.id,
        timestamp: trace.created_at,
        data: {
          trace_type: trace.trace_type,
          action_name: trace.action_name,
          input: this.parseRecord(trace.input),
          output: this.parseRecord(trace.output),
          duration_ms: trace.duration_ms,
        },
      })),
    ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  async updateSummary(session_id: string, summary: string): Promise<SessionRecord | null> {
    getDb()
      .prepare("UPDATE sessions SET summary = ?, updated_at = datetime('now') WHERE id = ?")
      .run(summary, session_id);
    return this.get(session_id);
  }

  private mapEvent(row: SessionEventRow): SessionEvent {
    return {
      id: row.id,
      session_id: row.session_id,
      event_type: row.event_type,
      data: this.parseRecord(row.data),
      created_at: row.created_at,
    };
  }

  private parseRecord(value: string): Record<string, unknown> {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  }
}
