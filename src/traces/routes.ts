import { FastifyInstance } from "fastify";
import { v4 as uuid } from "uuid";
import { getDb } from "../db.js";
import { SessionCreateInput, SessionEventInput } from "../schemas/session.js";
import { ToolCallTraceInput, SkillRunTraceInput } from "../schemas/traces.js";

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  app.post("/sessions", async (req, reply) => {
    const input = SessionCreateInput.parse(req.body);
    const id = uuid();
    const db = getDb();
    db.prepare(`INSERT INTO sessions (id, repo_id) VALUES (?, ?)`).run(
      id,
      input.repo_id ?? null,
    );
    reply.code(201);
    return { id, repo_id: input.repo_id ?? null, status: "active" };
  });

  app.get("/sessions/:session_id", async (req) => {
    const { session_id } = req.params as { session_id: string };
    const db = getDb();
    const row = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(session_id);
    if (!row) {
      return { error: "session not found" };
    }
    return row;
  });

  app.post("/sessions/:session_id/events", async (req, reply) => {
    const { session_id } = req.params as { session_id: string };
    const input = SessionEventInput.parse(req.body);
    const id = uuid();
    const db = getDb();
    db.prepare(
      `INSERT INTO session_events (id, session_id, event_type, data) VALUES (?, ?, ?, ?)`,
    ).run(id, session_id, input.event_type, JSON.stringify(input.data));
    reply.code(201);
    return { id, session_id, event_type: input.event_type };
  });

  app.get("/sessions/:session_id/timeline", async (req) => {
    const { session_id } = req.params as { session_id: string };
    const db = getDb();
    const events = db
      .prepare(`SELECT * FROM session_events WHERE session_id = ? ORDER BY created_at ASC`)
      .all(session_id) as Record<string, unknown>[];
    const traces = db
      .prepare(`SELECT * FROM traces WHERE session_id = ? ORDER BY created_at ASC`)
      .all(session_id) as Record<string, unknown>[];
    return {
      session_id,
      events: events.map((e) => ({ ...e, data: JSON.parse(e.data as string) })),
      traces: traces.map((t) => ({
        ...t,
        input: JSON.parse(t.input as string),
        output: JSON.parse(t.output as string),
      })),
    };
  });
}

export async function traceRoutes(app: FastifyInstance): Promise<void> {
  app.post("/traces/tool-call", async (req, reply) => {
    const input = ToolCallTraceInput.parse(req.body);
    const id = uuid();
    const db = getDb();
    db.prepare(
      `INSERT INTO traces (id, session_id, trace_type, action_name, input, output, duration_ms)
       VALUES (?, ?, 'tool-call', ?, ?, ?, ?)`,
    ).run(
      id,
      input.session_id,
      input.action_name,
      JSON.stringify(input.input),
      JSON.stringify(input.output),
      input.duration_ms ?? null,
    );
    reply.code(201);
    return { id, trace_type: "tool-call", action_name: input.action_name };
  });

  app.post("/traces/skill-run", async (req, reply) => {
    const input = SkillRunTraceInput.parse(req.body);
    const id = uuid();
    const db = getDb();
    db.prepare(
      `INSERT INTO traces (id, session_id, trace_type, action_name, input, output, duration_ms)
       VALUES (?, ?, 'skill-run', ?, ?, ?, ?)`,
    ).run(
      id,
      input.session_id,
      input.skill_name,
      JSON.stringify(input.input),
      JSON.stringify(input.output),
      input.duration_ms ?? null,
    );
    reply.code(201);
    return { id, trace_type: "skill-run", skill_name: input.skill_name };
  });

  app.get("/traces/session/:session_id", async (req) => {
    const { session_id } = req.params as { session_id: string };
    const db = getDb();
    const traces = db
      .prepare(`SELECT * FROM traces WHERE session_id = ? ORDER BY created_at ASC`)
      .all(session_id) as Record<string, unknown>[];
    return {
      session_id,
      traces: traces.map((t) => ({
        ...t,
        input: JSON.parse(t.input as string),
        output: JSON.parse(t.output as string),
      })),
    };
  });
}
