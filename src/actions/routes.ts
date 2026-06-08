import { FastifyInstance } from "fastify";
import {
  ActionRegisterInput,
  ActionValidateInput,
  ActionExecuteInput,
  ActionPipelineInput,
  AuditListInput,
  RecommendNextInput,
  PlanInput,
  ValidatePlanInput,
  OutcomeInput,
} from "../schemas/actions.js";
import { getProvider, hasProvider } from "../providers/registry.js";
import { executeActionPipeline } from "./pipeline.js";
import { getAuditRecord, listAuditRecords } from "./audit.js";
import type { ActionKnowledgeProvider } from "../providers/ActionKnowledgeProvider.js";
import type { RuleSolverProvider } from "../providers/RuleSolverProvider.js";
import type { SessionProvider } from "../providers/SessionProvider.js";

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
    const provider = getProvider("action");
    // Use ActionKnowledgeProvider.listActions() if available
    if ("listActions" in provider) {
      const definitions = await (provider as ActionKnowledgeProvider).listActions();
      return { actions: definitions };
    }
    const rows = await provider.list();
    return {
      actions: rows.map((r) => ({
        name: r.name,
        description: r.description,
        params_json_schema: r.jsonSchema ?? r.parameters,
        output_json_schema: {},
        risk: r.risk_level,
        side_effects: [],
        requires_platform_validation: true,
      })),
      advisory_only: true,
      requires_platform_validation: true,
    };
  });

  app.get("/actions/:action_name", async (req) => {
    const { action_name } = req.params as { action_name: string };
    const row = await getProvider("action").get(action_name);
    if (!row) {
      return { error: "action not found" };
    }
    return {
      name: row.name,
      description: row.description,
      schema: row.jsonSchema ?? row.parameters,
      risk_level: row.risk_level,
      requires_approval: row.requires_approval,
      advisory_only: true,
      requires_platform_validation: true,
    };
  });

  app.post("/actions/validate", async (req) => {
    const input = ActionValidateInput.parse(req.body);
    const validation = await getProvider("action").validate(input.action_name, input.params);
    if (!validation.valid) {
      return {
        valid: false,
        action_name: input.action_name,
        errors: validation.errors,
        issues: validation.issues,
        advisory_only: true,
        requires_platform_validation: true,
      };
    }
    return {
      valid: true,
      action_name: input.action_name,
      params: input.params,
      advisory_only: true,
      requires_platform_validation: true,
    };
  });

  // agent-core is an action-knowledge service, not the live execution plane.
  // These simulation routes exist for local tests and contract validation only.
  app.post("/actions/mock-execute", async (req) => {
    const input = ActionExecuteInput.parse(req.body);
    const result = await getProvider("action").execute(input.action_name, input.params);
    if (result.error?.startsWith("Unknown action:")) {
      return {
        error: `Unknown action: ${input.action_name}`,
        executed: false,
        advisory_only: true,
        requires_platform_validation: true,
      };
    }
    if (result.error === "Action requires platform approval") {
      return {
        executed: false,
        reason: "Action requires platform approval",
        action_name: input.action_name,
        approval_required: true,
        advisory_only: true,
        requires_platform_validation: true,
      };
    }
    return {
      mock_contract_only: true,
      executed: result.success,
      action_name: input.action_name,
      execution_mode: result.execution_mode,
      result: result.output,
      rationale: input.rationale ?? null,
      advisory_only: true,
      requires_platform_validation: true,
    };
  });

  app.post("/actions/simulate-pipeline", async (req) => {
    const input = ActionPipelineInput.parse(req.body);
    const ruleSolver = hasProvider("ruleSolver")
      ? (getProvider("ruleSolver") as RuleSolverProvider)
      : undefined;
    const traceProvider = hasProvider("trace") ? getProvider("trace") : undefined;
    const sessionProvider = hasProvider("session")
      ? (getProvider("session") as SessionProvider)
      : undefined;
    const result = await executeActionPipeline(
      {
        action_name: input.action_name,
        params: input.params,
        session_id: input.session_id,
        user_id: input.user_id,
        task_type: input.task_type,
        completed_actions: input.completed_actions,
        rationale: input.rationale,
      },
      getProvider("action"),
      getProvider("policyMatcher"),
      ruleSolver,
      traceProvider,
      sessionProvider,
    );
    return {
      ...result,
      simulation: true,
      advisory_only: true,
      requires_platform_validation: true,
    };
  });

  app.post("/actions/execute", async (_req, reply) => {
    reply.code(410);
    return {
      error: "deprecated_endpoint",
      message: "Use /actions/mock-execute for local simulation. Live execution belongs to the platform control plane.",
      replacement: "/actions/mock-execute",
      advisory_only: true,
      requires_platform_validation: true,
    };
  });

  app.post("/actions/pipeline", async (_req, reply) => {
    reply.code(410);
    return {
      error: "deprecated_endpoint",
      message: "Use /actions/simulate-pipeline for local simulation. Live pipelines belong to the platform control plane.",
      replacement: "/actions/simulate-pipeline",
      advisory_only: true,
      requires_platform_validation: true,
    };
  });

  // ── ActionKnowledgeProvider endpoints ─────────────────────────────

  app.post("/actions/recommend-next", async (req) => {
    const provider = getProvider("action");
    if (!("recommendNextActions" in provider)) {
      return { error: "ActionKnowledgeProvider not available", recommendations: [] };
    }
    const input = RecommendNextInput.parse(req.body);
    const recommendations = await (provider as ActionKnowledgeProvider).recommendNextActions({
      task_type: input.task_type,
      current_action: input.current_action,
      completed_actions: input.completed_actions,
      context: input.context,
    });
    return { recommendations };
  });

  app.post("/actions/plan", async (req) => {
    const provider = getProvider("action");
    if (!("buildPlan" in provider)) {
      return { error: "ActionKnowledgeProvider not available" };
    }
    const input = PlanInput.parse(req.body);
    const plan = await (provider as ActionKnowledgeProvider).buildPlan({
      task_type: input.task_type,
      prompt: input.prompt,
      repo_id: input.repo_id,
      context: input.context,
    });
    return {
      plan,
      schema_valid: true,
      requires_platform_validation: true,
    };
  });

  app.post("/actions/validate-plan", async (req) => {
    const provider = getProvider("action");
    if (!("validatePlan" in provider)) {
      return { error: "ActionKnowledgeProvider not available" };
    }
    const input = ValidatePlanInput.parse(req.body);
    const plan = {
      task_type: input.task_type,
      steps: input.steps.map((s) => ({
        action_name: s.action_name,
        params: s.params,
        requires_platform_validation: true as const,
      })),
      state: input.state ?? {
        current_action: null,
        completed_actions: [],
        known_risks: [],
        missing_context: [],
      },
    };
    const result = await (provider as ActionKnowledgeProvider).validatePlan(plan);
    return result;
  });

  app.post("/actions/outcome", async (req, reply) => {
    const provider = getProvider("action");
    if (!("recordActionOutcome" in provider)) {
      return { error: "ActionKnowledgeProvider not available" };
    }
    const input = OutcomeInput.parse(req.body);
    const stored = await (provider as ActionKnowledgeProvider).recordActionOutcome(input);

    // Also record as trace + session event if providers are available
    if (hasProvider("trace")) {
      await getProvider("trace").recordToolCall(
        input.session_id,
        input.action_name,
        input.params,
        input.output,
        input.duration_ms,
      );
    }
    if (hasProvider("session")) {
      const sessionProvider = getProvider("session") as SessionProvider;
      try {
        await sessionProvider.addEvent(input.session_id, "ACTION_OUTCOME", {
          action_name: input.action_name,
          status: input.status,
          executor: input.executor,
          duration_ms: input.duration_ms,
          outcome_id: stored.id,
        });
      } catch {
        // Session may not exist — non-fatal
      }
    }

    reply.code(201);
    return { recorded: true, outcome_id: stored.id };
  });

  app.get("/actions/outcomes/:session_id", async (req) => {
    const provider = getProvider("action");
    if (!("getOutcomes" in provider)) {
      return { error: "ActionKnowledgeProvider not available", outcomes: [] };
    }
    const { session_id } = req.params as { session_id: string };
    const outcomes = await (provider as ActionKnowledgeProvider).getOutcomes(session_id);
    return { session_id, outcomes };
  });

  app.get("/actions/stats/:action_name", async (req) => {
    const provider = getProvider("action");
    if (!("getActionStats" in provider)) {
      return { error: "ActionKnowledgeProvider not available" };
    }
    const { action_name } = req.params as { action_name: string };
    const stats = await (provider as ActionKnowledgeProvider).getActionStats(action_name);
    return { action_name, ...stats };
  });

  // ── Audit endpoints ──────────────────────────────────────────────

  app.get("/audits", async (req) => {
    const query = req.query as Record<string, string>;
    const input = AuditListInput.parse(query);
    const records = listAuditRecords({
      session_id: input.session_id,
      action_name: input.action_name,
      status: input.status,
      limit: input.limit,
    });
    return { audits: records };
  });

  app.get("/audits/:audit_id", async (req) => {
    const { audit_id } = req.params as { audit_id: string };
    const record = getAuditRecord(audit_id);
    if (!record) {
      return { error: "audit record not found" };
    }
    return record;
  });

  app.get("/sessions/:session_id/audits", async (req) => {
    const { session_id } = req.params as { session_id: string };
    const query = req.query as Record<string, string>;
    const limit = query.limit ? parseInt(query.limit, 10) : 100;
    const records = listAuditRecords({ session_id, limit });
    return { session_id, audits: records };
  });
}
