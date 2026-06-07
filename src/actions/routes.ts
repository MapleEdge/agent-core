import { FastifyInstance } from "fastify";
import {
  ActionRegisterInput,
  ActionValidateInput,
  ActionExecuteInput,
} from "../schemas/actions.js";
import { getProvider } from "../providers/registry.js";

export async function actionRoutes(app: FastifyInstance): Promise<void> {
  app.post("/actions/register", async (req, reply) => {
    const input = ActionRegisterInput.parse(req.body);
    await getProvider("action").register({
      name: input.name,
      description: input.description,
      parameters: input.schema,
      risk_level: input.risk_level,
      requires_approval: input.requires_approval,
    });
    reply.code(201);
    return { name: input.name, status: "registered" };
  });

  app.get("/actions", async () => {
    const rows = await getProvider("action").list();
    return {
      actions: rows.map((r) => ({
        ...r,
        schema: r.parameters,
      })),
    };
  });

  app.get("/actions/:action_name", async (req) => {
    const { action_name } = req.params as { action_name: string };
    const row = await getProvider("action").get(action_name);
    if (!row) {
      return { error: "action not found" };
    }
    return {
      ...row,
      schema: row.parameters,
    };
  });

  app.post("/actions/validate", async (req) => {
    const input = ActionValidateInput.parse(req.body);
    const validation = await getProvider("action").validate(input.action_name, input.params);
    if (!validation.valid) {
      return { valid: false, reason: `Unknown action: ${input.action_name}` };
    }
    return { valid: true, action_name: input.action_name, params: input.params };
  });

  app.post("/actions/execute", async (req) => {
    const input = ActionExecuteInput.parse(req.body);
    const result = await getProvider("action").execute(input.action_name, input.params);
    if (result.error?.startsWith("Unknown action:")) {
      return { error: `Unknown action: ${input.action_name}`, executed: false };
    }
    if (result.error === "Action requires platform approval") {
      return {
        executed: false,
        reason: "Action requires platform approval",
        action_name: input.action_name,
        approval_required: true,
      };
    }
    return {
      executed: result.success,
      action_name: input.action_name,
      execution_mode: result.execution_mode,
      result: result.output,
    };
  });
}
