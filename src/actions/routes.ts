import { FastifyInstance } from "fastify";
import { getDb } from "../db.js";
import {
  ActionRegisterInput,
  ActionValidateInput,
  ActionExecuteInput,
} from "../schemas/actions.js";
import { executeMockAction } from "./executor.js";

export async function actionRoutes(app: FastifyInstance): Promise<void> {
  app.post("/actions/register", async (req, reply) => {
    const input = ActionRegisterInput.parse(req.body);
    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO actions (name, description, schema, risk_level, requires_approval)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      input.name,
      input.description,
      JSON.stringify(input.schema),
      input.risk_level,
      input.requires_approval ? 1 : 0,
    );
    reply.code(201);
    return { name: input.name, status: "registered" };
  });

  app.get("/actions", async () => {
    const db = getDb();
    const rows = db.prepare(`SELECT * FROM actions ORDER BY name`).all() as Record<
      string,
      unknown
    >[];
    return {
      actions: rows.map((r) => ({
        ...r,
        schema: JSON.parse(r.schema as string),
        requires_approval: Boolean(r.requires_approval),
      })),
    };
  });

  app.get("/actions/:action_name", async (req) => {
    const { action_name } = req.params as { action_name: string };
    const db = getDb();
    const row = db.prepare(`SELECT * FROM actions WHERE name = ?`).get(action_name) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return { error: "action not found" };
    }
    return {
      ...row,
      schema: JSON.parse(row.schema as string),
      requires_approval: Boolean(row.requires_approval),
    };
  });

  app.post("/actions/validate", async (req) => {
    const input = ActionValidateInput.parse(req.body);
    const db = getDb();
    const row = db.prepare(`SELECT * FROM actions WHERE name = ?`).get(input.action_name) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return { valid: false, reason: `Unknown action: ${input.action_name}` };
    }
    return { valid: true, action_name: input.action_name, params: input.params };
  });

  app.post("/actions/execute", async (req) => {
    const input = ActionExecuteInput.parse(req.body);
    const db = getDb();
    const row = db.prepare(`SELECT * FROM actions WHERE name = ?`).get(input.action_name) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return { error: `Unknown action: ${input.action_name}`, executed: false };
    }
    if (row.requires_approval) {
      return {
        executed: false,
        reason: "Action requires platform approval",
        action_name: input.action_name,
        approval_required: true,
      };
    }
    const result = executeMockAction(input.action_name, input.params);
    return { executed: true, action_name: input.action_name, result };
  });
}
