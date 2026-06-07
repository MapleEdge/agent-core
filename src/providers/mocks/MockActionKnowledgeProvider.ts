/**
 * MockActionKnowledgeProvider — extends MockActionProvider with
 * planning, recommendation, and outcome recording.
 *
 * Uses the Letta rule solver for allowed-next-action logic and
 * builds advisory plans from static templates per task_type.
 */

import { getDb } from "../../db.js";
import { executeMockAction } from "../../actions/executor.js";
import { getActionSchema } from "../../actions/actionSchemas.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  insertOutcome,
  getOutcomesBySession,
  getActionStats as getActionStatsFromStore,
  ensureOutcomeTable,
} from "../../actions/outcomeStore.js";
import type {
  ActionSchema,
  ActionValidationResult,
  ActionExecutionResult,
} from "../ActionProvider.js";
import type {
  ActionKnowledgeProvider,
  ActionDefinition,
  ActionRecommendationContext,
  ActionRecommendation,
  ActionPlanContext,
  ActionPlan,
  ActionPlanStep,
  ActionPlanValidationResult,
  ActionOutcomeRecord,
  StoredOutcome,
} from "../ActionKnowledgeProvider.js";
import type { RuleSolverProvider } from "../RuleSolverProvider.js";
import type { ProviderStatus } from "../registry.js";

interface ActionRow {
  name: string;
  description: string;
  schema: string;
  risk_level: ActionSchema["risk_level"];
  requires_approval: number;
}

/** Side-effect annotations per known action. */
const ACTION_SIDE_EFFECTS: Record<string, string[]> = {
  read_file: [],
  grep: [],
  classify_task: [],
  retrieve_context: [],
  search_memory: [],
  summarize_diff: [],
  write_file: ["filesystem"],
  run_tests: ["filesystem", "process"],
  commit: ["git", "filesystem"],
  request_approval: ["notification"],
};

/** Static plan templates per task_type. */
const PLAN_TEMPLATES: Record<string, Array<{ action_name: string; params: Record<string, unknown> }>> = {
  code_edit: [
    { action_name: "classify_task", params: {} },
    { action_name: "retrieve_context", params: {} },
    { action_name: "grep", params: { pattern: "" } },
    { action_name: "read_file", params: { path: "" } },
    { action_name: "write_file", params: { path: "", content: "" } },
    { action_name: "run_tests", params: {} },
    { action_name: "summarize_diff", params: {} },
    { action_name: "request_approval", params: { action: "commit", reason: "" } },
    { action_name: "commit", params: { message: "" } },
  ],
  bug_fix: [
    { action_name: "classify_task", params: {} },
    { action_name: "grep", params: { pattern: "" } },
    { action_name: "read_file", params: { path: "" } },
    { action_name: "run_tests", params: {} },
    { action_name: "write_file", params: { path: "", content: "" } },
    { action_name: "run_tests", params: {} },
    { action_name: "summarize_diff", params: {} },
    { action_name: "commit", params: { message: "" } },
  ],
  review: [
    { action_name: "classify_task", params: {} },
    { action_name: "retrieve_context", params: {} },
    { action_name: "read_file", params: { path: "" } },
    { action_name: "summarize_diff", params: {} },
  ],
};

export class MockActionKnowledgeProvider implements ActionKnowledgeProvider {
  readonly name = "mock-action-knowledge";
  readonly status: ProviderStatus = "mock";

  private ruleSolver: RuleSolverProvider | null = null;

  constructor() {
    ensureOutcomeTable();
  }

  /** Inject rule solver for recommendation/plan logic. */
  setRuleSolver(solver: RuleSolverProvider): void {
    this.ruleSolver = solver;
  }

  // ── ActionProvider base methods ─────────────────────────────────

  async register(schema: ActionSchema): Promise<ActionSchema> {
    getDb()
      .prepare("INSERT OR REPLACE INTO actions (name, description, schema, risk_level, requires_approval) VALUES (?, ?, ?, ?, ?)")
      .run(
        schema.name,
        schema.description,
        JSON.stringify(schema.parameters),
        schema.risk_level,
        schema.requires_approval ? 1 : 0,
      );
    return schema;
  }

  async list(): Promise<ActionSchema[]> {
    const rows = getDb().prepare("SELECT * FROM actions ORDER BY name").all() as ActionRow[];
    return rows.map((row) => this.mapAction(row));
  }

  async get(name: string): Promise<ActionSchema | null> {
    const row = getDb().prepare("SELECT * FROM actions WHERE name = ?").get(name) as ActionRow | undefined;
    return row ? this.mapAction(row) : null;
  }

  async validate(name: string, params: Record<string, unknown>): Promise<ActionValidationResult> {
    const action = await this.get(name);
    if (!action) return { valid: false, errors: [`Unknown action: ${name}`] };

    const zodSchema = getActionSchema(name);
    if (zodSchema) {
      const result = zodSchema.safeParse(params);
      if (!result.success) {
        const issues = result.error.issues.map((issue) => ({
          path: issue.path.join(".") || "(root)",
          message: issue.message,
        }));
        return {
          valid: false,
          errors: issues.map((i) => `${i.path}: ${i.message}`),
          issues,
        };
      }
      return { valid: true, errors: [] };
    }

    return { valid: true, errors: [] };
  }

  async execute(name: string, params: Record<string, unknown>): Promise<ActionExecutionResult> {
    const action = await this.get(name);
    if (!action) {
      return {
        success: false,
        output: null,
        duration_ms: 0,
        execution_mode: "mock",
        error: `Unknown action: ${name}`,
      };
    }
    if (action.requires_approval) {
      return {
        success: false,
        output: null,
        duration_ms: 0,
        execution_mode: "mock",
        error: "Action requires platform approval",
      };
    }

    const start = performance.now();
    const output = executeMockAction(name, params);
    const duration_ms = Math.round(performance.now() - start);
    return {
      success: true,
      output,
      duration_ms,
      execution_mode: name === "read_file" ? "local_safe" : "mock",
    };
  }

  // ── ActionKnowledgeProvider methods ─────────────────────────────

  async listActions(): Promise<ActionDefinition[]> {
    const schemas = await this.list();
    return schemas.map((s) => this.toDefinition(s));
  }

  async getAction(name: string): Promise<ActionDefinition | null> {
    const schema = await this.get(name);
    return schema ? this.toDefinition(schema) : null;
  }

  async recommendNextActions(context: ActionRecommendationContext): Promise<ActionRecommendation[]> {
    if (!this.ruleSolver) {
      return [];
    }

    const result = await this.ruleSolver.getAllowedNext(
      context.task_type,
      context.current_action ?? null,
      context.completed_actions,
      {},
    );

    if (result.allowed.length === 0) {
      return [];
    }

    // Score recommendations using outcome history
    const recommendations: ActionRecommendation[] = [];
    for (const actionName of result.allowed) {
      const stats = getActionStatsFromStore(actionName);
      const successRate = stats.total > 0 ? stats.succeeded / stats.total : 0.5;
      const confidence = stats.total > 0 ? Math.min(0.5 + successRate * 0.4, 0.95) : 0.5;

      const action = await this.get(actionName);
      const rationale = this.buildRationale(actionName, context, stats);

      recommendations.push({
        action_name: actionName,
        params: this.suggestParams(actionName, context),
        schema_valid: action !== null,
        requires_platform_validation: true,
        confidence,
        rationale,
      });
    }

    // Sort by confidence descending
    recommendations.sort((a, b) => b.confidence - a.confidence);
    return recommendations;
  }

  async buildPlan(context: ActionPlanContext): Promise<ActionPlan> {
    const template = PLAN_TEMPLATES[context.task_type] ?? PLAN_TEMPLATES["code_edit"]!;

    const steps: ActionPlanStep[] = template.map((step) => ({
      action_name: step.action_name,
      params: this.enrichPlanParams(step.action_name, step.params, context),
      requires_platform_validation: true as const,
    }));

    return {
      task_type: context.task_type,
      steps,
      state: {
        current_action: null,
        completed_actions: [],
        known_risks: [],
        missing_context: this.identifyMissingContext(context),
      },
    };
  }

  async validatePlan(plan: ActionPlan): Promise<ActionPlanValidationResult> {
    const errors: string[] = [];
    const stepResults: ActionPlanValidationResult["step_results"] = [];

    const sequenceNames = plan.steps.map((s) => s.action_name);

    // Validate sequence via rule solver
    let sequenceValid = true;
    if (this.ruleSolver) {
      const seqResult = await this.ruleSolver.validateSequence(plan.task_type, sequenceNames);
      if (!seqResult.valid) {
        sequenceValid = false;
        errors.push(...seqResult.violations);
      }
    }

    // Validate each step
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i]!;
      const action = await this.get(step.action_name);
      const stepErrors: string[] = [];

      if (!action) {
        stepErrors.push(`Unknown action: ${step.action_name}`);
      } else {
        const validation = await this.validate(step.action_name, step.params);
        if (!validation.valid) {
          stepErrors.push(...validation.errors);
        }
      }

      stepResults.push({
        step_index: i,
        action_name: step.action_name,
        schema_valid: action !== null && stepErrors.length === 0,
        sequence_valid: sequenceValid,
        errors: stepErrors,
      });

      if (stepErrors.length > 0) {
        errors.push(...stepErrors.map((e) => `Step ${i} (${step.action_name}): ${e}`));
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      step_results: stepResults,
    };
  }

  async recordActionOutcome(outcome: ActionOutcomeRecord): Promise<StoredOutcome> {
    return insertOutcome(outcome);
  }

  async getOutcomes(sessionId: string): Promise<StoredOutcome[]> {
    return getOutcomesBySession(sessionId);
  }

  async getActionStats(actionName: string): Promise<{
    total: number;
    succeeded: number;
    failed: number;
    avg_duration_ms: number;
  }> {
    return getActionStatsFromStore(actionName);
  }

  // ── Private helpers ─────────────────────────────────────────────

  private mapAction(row: ActionRow): ActionSchema {
    const zodSchema = getActionSchema(row.name);
    return {
      name: row.name,
      description: row.description,
      parameters: JSON.parse(row.schema) as Record<string, unknown>,
      risk_level: row.risk_level,
      requires_approval: Boolean(row.requires_approval),
      zodSchema,
      jsonSchema: zodSchema ? zodToJsonSchema(zodSchema) as Record<string, unknown> : undefined,
    };
  }

  private toDefinition(schema: ActionSchema): ActionDefinition {
    return {
      name: schema.name,
      description: schema.description,
      params_json_schema: schema.jsonSchema ?? schema.parameters,
      output_json_schema: {},
      risk: schema.risk_level,
      side_effects: ACTION_SIDE_EFFECTS[schema.name] ?? [],
      requires_platform_validation: true,
    };
  }

  private suggestParams(
    actionName: string,
    context: ActionRecommendationContext,
  ): Record<string, unknown> {
    const prompt = (context.context["prompt"] as string) ?? "";
    switch (actionName) {
      case "classify_task":
        return { task_type: context.task_type, prompt };
      case "grep":
        return { pattern: prompt.split(/\s+/).slice(0, 3).join("|") || "" };
      case "retrieve_context":
        return { repo_id: (context.context["repo_id"] as string) ?? "" };
      case "search_memory":
        return { query: prompt };
      default:
        return {};
    }
  }

  private buildRationale(
    actionName: string,
    context: ActionRecommendationContext,
    stats: { total: number; succeeded: number; failed: number },
  ): string {
    const completed = context.completed_actions;
    const last = completed.at(-1) ?? "start";

    if (stats.total === 0) {
      return `Next step after ${last} in ${context.task_type} workflow.`;
    }
    const rate = Math.round((stats.succeeded / stats.total) * 100);
    return `Next step after ${last}. ${actionName} has ${rate}% success rate (${stats.total} executions).`;
  }

  private enrichPlanParams(
    actionName: string,
    baseParams: Record<string, unknown>,
    context: ActionPlanContext,
  ): Record<string, unknown> {
    switch (actionName) {
      case "classify_task":
        return { ...baseParams, task_type: context.task_type, prompt: context.prompt };
      case "grep":
        return { ...baseParams, pattern: context.prompt.split(/\s+/).slice(0, 3).join("|") || "" };
      case "retrieve_context":
        return { ...baseParams, repo_id: context.repo_id ?? "" };
      case "commit":
        return { ...baseParams, message: `fix: ${context.prompt.slice(0, 72)}` };
      default:
        return baseParams;
    }
  }

  private identifyMissingContext(context: ActionPlanContext): string[] {
    const missing: string[] = [];
    if (!context.repo_id) missing.push("repo_id");
    if (!context.prompt || context.prompt.length < 10) missing.push("detailed_prompt");
    return missing;
  }
}
