import { FastifyInstance } from "fastify";
import {
  ActionRegisterInput,
  ActionValidateInput,
  ActionExecuteInput,
  ActionPipelineInput,
  AuditListInput,
  OutcomeInput,
  RecommendNextInput,
} from "../schemas/actions.js";
import { getProvider, hasProvider, getCapabilityMatrix } from "../providers/registry.js";
import { executeActionPipeline } from "./pipeline.js";
import { getAuditRecord, listAuditRecords } from "./audit.js";
import { insertOutcome, getOutcomesBySession, getActionStats } from "./outcomeStore.js";
import { LLMPlanRequestSchema, ValidatePlanRequestSchema } from "./actionPlanSchemas.js";
import type { PlanResponse } from "./actionPlanSchemas.js";
import { generatePlan } from "./ActionPlanner.js";
import { validatePlanDeterministic } from "./actionPlanValidator.js";
import type { ActionKnowledgeProvider } from "../providers/ActionKnowledgeProvider.js";
import type { RuleSolverProvider } from "../providers/RuleSolverProvider.js";
import type { SessionProvider } from "../providers/SessionProvider.js";
import type { LLMClient } from "../llm/LLMClient.js";

import { isDeepSeekConfigured, DeepSeekClient } from "../llm/DeepSeekClient.js";
import { isGeminiConfigured, GeminiClient } from "../llm/GeminiClient.js";

/** Resolve the best available LLM client for planning. */
function resolveLLMClient(): LLMClient | null {
  if (isDeepSeekConfigured()) return new DeepSeekClient();
  if (isGeminiConfigured()) return new GeminiClient();
  return null;
}

export async function actionRoutes(app: FastifyInstance): Promise<void> {
  // ── Action catalog ──────────────────────────────────────────────

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
    const provider = getProvider("action");
    if ("getAction" in provider) {
      const def = await (provider as ActionKnowledgeProvider).getAction(action_name);
      if (!def) return { error: "action not found" };
      return def;
    }
    const row = await provider.get(action_name);
    if (!row) return { error: "action not found" };
    return {
      name: row.name,
      description: row.description,
      params_json_schema: row.jsonSchema ?? row.parameters,
      output_json_schema: {},
      risk: row.risk_level,
      side_effects: [],
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
      production_execution_supported: false,
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

  // ── LLM-first planning ────────────────────────────────────────

  /**
   * POST /actions/plan — LLM-first action planning.
   *
   * Primary planning path. Replaces classifier-first routing.
   * Builds a plan from prompt + visible catalog + context.
   * Validates deterministically after LLM generation.
   * Does NOT execute anything.
   */
  app.post("/actions/plan", async (req) => {
    const input = LLMPlanRequestSchema.parse(req.body);

    const llmClient = resolveLLMClient();
    if (!llmClient) {
      // Fallback: use MockActionKnowledgeProvider.buildPlan() if available
      const provider = getProvider("action");
      if ("buildPlan" in provider) {
        const plan = await (provider as ActionKnowledgeProvider).buildPlan({
          task_type: "code_edit",
          prompt: input.prompt,
          repo_id: input.repo_id,
        });

        const allowedSet = new Set(input.allowed_actions);
        const filteredSteps = plan.steps.filter((s) => allowedSet.has(s.action_name));

        if (filteredSteps.length === 0) {
          return {
            ok: false,
            plan: null,
            schema_valid: false,
            requires_platform_validation: true,
            source: "template_plan_validated_by_agent_core",
            warnings: [{ source: "planner", message: "No LLM configured; using template fallback." }],
            errors: ["No template steps match the given allowed_actions."],
          } satisfies PlanResponse;
        }

        return {
          ok: true,
          plan: {
            goal: input.prompt,
            mode: input.mode_preference ?? "finite",
            steps: filteredSteps.map((s) => ({
              action_name: s.action_name,
              params: s.params,
              rationale: "",
              requires_platform_validation: true as const,
            })),
          },
          schema_valid: true,
          requires_platform_validation: true,
          source: "template_plan_validated_by_agent_core",
          warnings: [{ source: "planner", message: "No LLM configured; using template fallback." }],
          errors: [],
        } satisfies PlanResponse;
      }

      return {
        ok: false,
        plan: null,
        schema_valid: false,
        requires_platform_validation: true,
        source: "llm_plan_validated_by_agent_core",
        warnings: [],
        errors: ["No LLM client configured (set DEEPSEEK_API_KEY or GEMINI_API_KEY)."],
      } satisfies PlanResponse;
    }

    // Full LLM planning path
    const provider = getProvider("action");
    let catalog: import("../providers/ActionKnowledgeProvider.js").ActionDefinition[] = [];
    if ("listActions" in provider) {
      catalog = await (provider as ActionKnowledgeProvider).listActions();
    } else {
      const rows = await provider.list();
      catalog = rows.map((r) => ({
        name: r.name,
        description: r.description,
        params_json_schema: r.jsonSchema ?? r.parameters ?? {},
        output_json_schema: {},
        risk: r.risk_level as "low" | "medium" | "high" | "critical",
        side_effects: [],
        requires_platform_validation: true as const,
      }));
    }

    const ruleSolver = hasProvider("ruleSolver")
      ? (getProvider("ruleSolver") as RuleSolverProvider)
      : null;

    return generatePlan(
      {
        session_id: input.session_id,
        repo_id: input.repo_id,
        prompt: input.prompt,
        allowed_actions: input.allowed_actions,
        mode_preference: input.mode_preference,
        recent_memories: input.recent_memories,
        context_summaries: input.context_summaries,
        recent_action_outcomes: input.recent_action_outcomes,
      },
      { llmClient, actionCatalog: catalog, ruleSolver },
    );
  });

  /**
   * POST /actions/validate-plan — Deterministic only. No LLM.
   *
   * Validates known actions, session-visible actions, params schemas,
   * plan shape, requires_platform_validation invariant.
   * Does NOT validate platform permission, file safety, or execution safety.
   */
  app.post("/actions/validate-plan", async (req) => {
    const input = ValidatePlanRequestSchema.parse(req.body);

    const ruleSolver = hasProvider("ruleSolver")
      ? (getProvider("ruleSolver") as RuleSolverProvider)
      : null;

    const result = await validatePlanDeterministic(
      { plan: input.plan, allowedActions: input.allowed_actions },
      ruleSolver,
    );

    return {
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
      requires_platform_validation: true,
    };
  });

  /**
   * POST /actions/recommend-next — Stepwise recommendations.
   *
   * For agents that operate step-by-step. Delegates to
   * ActionKnowledgeProvider.recommendNextActions().
   */
  app.post("/actions/recommend-next", async (req) => {
    const provider = getProvider("action");
    if (!("recommendNextActions" in provider)) {
      return { error: "ActionKnowledgeProvider not available", recommendations: [] };
    }
    const body = RecommendNextInput.parse(req.body);
    const recommendations = await (provider as ActionKnowledgeProvider).recommendNextActions({
      task_type: body.task_type,
      current_action: body.current_action,
      completed_actions: body.completed_actions,
      context: body.context,
    });
    return { recommendations };
  });

  /**
   * POST /actions/outcome — Record what jubilant-goggles actually executed.
   */
  app.post("/actions/outcome", async (req, reply) => {
    const input = OutcomeInput.parse(req.body);
    const stored = insertOutcome(input);

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
      } catch { /* session may not exist — non-fatal */ }
    }

    reply.code(201);
    return { recorded: true, outcome_id: stored.id };
  });

  app.get("/actions/outcomes/:session_id", async (req) => {
    const { session_id } = req.params as { session_id: string };
    return { session_id, outcomes: getOutcomesBySession(session_id) };
  });

  app.get("/actions/stats/:action_name", async (req) => {
    const { action_name } = req.params as { action_name: string };
    return { action_name, ...getActionStats(action_name) };
  });

  // ── Provider status ─────────────────────────────────────────────

  app.get("/providers", async () => {
    return { providers: getCapabilityMatrix() };
  });

  // ── Audit endpoints ──────────────────────────────────────────────

  app.get("/audits", async (req) => {
    const query = req.query as Record<string, string>;
    const input = AuditListInput.parse(query);
    return { audits: listAuditRecords({
      session_id: input.session_id,
      action_name: input.action_name,
      status: input.status,
      limit: input.limit,
    }) };
  });

  app.get("/audits/:audit_id", async (req) => {
    const { audit_id } = req.params as { audit_id: string };
    const record = getAuditRecord(audit_id);
    if (!record) return { error: "audit record not found" };
    return record;
  });

  app.get("/sessions/:session_id/audits", async (req) => {
    const { session_id } = req.params as { session_id: string };
    const query = req.query as Record<string, string>;
    const limit = query.limit ? parseInt(query.limit, 10) : 100;
    return { session_id, audits: listAuditRecords({ session_id, limit }) };
  });
}
