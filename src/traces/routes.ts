import { FastifyInstance } from "fastify";
import { SessionCreateInput, SessionEventInput, SessionListInput, SessionCloseInput } from "../schemas/session.js";
import { ToolCallTraceInput, SkillRunTraceInput } from "../schemas/traces.js";
import { getProvider } from "../providers/registry.js";

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  app.post("/sessions", async (req, reply) => {
    const input = SessionCreateInput.parse(req.body);
    const session = await getProvider("session").create(input.repo_id);
    reply.code(201);
    return { id: session.id, repo_id: session.repo_id, status: session.status };
  });

  app.get("/sessions/:session_id", async (req) => {
    const { session_id } = req.params as { session_id: string };
    const session = await getProvider("session").get(session_id);
    if (!session) {
      return { error: "session not found" };
    }
    return session;
  });

  app.post("/sessions/:session_id/events", async (req, reply) => {
    const { session_id } = req.params as { session_id: string };
    const input = SessionEventInput.parse(req.body);
    const event = await getProvider("session").addEvent(session_id, input.event_type, input.data);
    reply.code(201);
    return { id: event.id, session_id, event_type: event.event_type };
  });

  app.get("/sessions", async (req) => {
    const query = req.query as Record<string, string>;
    const input = SessionListInput.parse(query);
    const sessions = await getProvider("session").list({
      status: input.status,
      repo_id: input.repo_id,
      limit: input.limit,
    });
    return { sessions };
  });

  app.post("/sessions/:session_id/close", async (req) => {
    const { session_id } = req.params as { session_id: string };
    const input = SessionCloseInput.parse(req.body ?? {});
    const session = await getProvider("session").close(session_id, input.summary);
    if (!session) return { error: "session not found" };
    return session;
  });

  app.delete("/sessions/:session_id", async (req, reply) => {
    const { session_id } = req.params as { session_id: string };
    const deleted = await getProvider("session").delete(session_id);
    if (!deleted) return { error: "session not found" };
    reply.code(204);
    return;
  });

  app.get("/sessions/:session_id/timeline", async (req) => {
    const { session_id } = req.params as { session_id: string };
    const timeline = await getProvider("session").getTimeline(session_id);
    return {
      session_id,
      events: timeline
        .filter((item) => item.type === "event")
        .map((item) => ({ id: item.id, created_at: item.timestamp, data: item.data })),
      traces: timeline
        .filter((item) => item.type === "trace")
        .map((item) => ({ id: item.id, created_at: item.timestamp, ...item.data })),
    };
  });
}

export async function traceRoutes(app: FastifyInstance): Promise<void> {
  app.post("/traces/tool-call", async (req, reply) => {
    const input = ToolCallTraceInput.parse(req.body);
    const trace = await getProvider("trace").recordToolCall(
      input.session_id,
      input.action_name,
      input.input,
      input.output,
      input.duration_ms,
    );
    reply.code(201);
    return { id: trace.id, trace_type: trace.trace_type, action_name: trace.action_name };
  });

  app.post("/traces/skill-run", async (req, reply) => {
    const input = SkillRunTraceInput.parse(req.body);
    const trace = await getProvider("trace").recordSkillRun(
      input.session_id,
      input.skill_name,
      input.input,
      input.output,
      input.duration_ms,
    );
    reply.code(201);
    return { id: trace.id, trace_type: trace.trace_type, skill_name: trace.action_name };
  });

  app.get("/traces/session/:session_id", async (req) => {
    const { session_id } = req.params as { session_id: string };
    const traces = await getProvider("trace").getBySession(session_id);
    return { session_id, traces };
  });
}
