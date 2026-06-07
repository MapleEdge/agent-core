/**
 * Cognee-inspired action execution pipeline.
 *
 * Reference: cognee execute_tool() dispatcher
 *   vendor/providers/knowledge/cognee/cognee/modules/tools/execute_tool.py
 *
 * Cognee's dispatcher is a 4-stage linear pipeline:
 *   1. Scope check  — tool must be in the active skill/tool scope (execute_tool.py:61-62)
 *   2. Lookup       — resolve tool name to a Tool DataPoint (execute_tool.py:64)
 *   3. Permission   — verify user ACL on the dataset (execute_tool.py:66-78)
 *   4. Invocation   — import handler and call it, wrapping errors (execute_tool.py:80-88)
 *
 * Our pipeline is architecturally superior in three ways:
 *
 * 1. **Structured results instead of exceptions.** Cognee raises typed exceptions
 *    at each stage; callers must catch four exception types. We return a single
 *    `PipelineResult` with `.stage`, `.success`, `.error`, and `.execution` —
 *    better for HTTP routes that need to serialize failure details as JSON.
 *
 * 2. **Integrated policy matching.** Cognee's permission stage only checks
 *    dataset-level ACLs via `get_authorized_existing_datasets()`. Our pipeline
 *    checks both Letta-style rule-solver scope AND Parlant-style policy rules.
 *    The policy matcher returns structured match evidence (matched_rules,
 *    approval_type, reason) that flows into the pipeline result.
 *
 * 3. **Pre-invocation validation.** Cognee validates args inside the handler
 *    (input_schema check is the handler's job). We validate against the
 *    ActionProvider schema before invoking, so bad params never reach the
 *    handler. This adds a 5th stage between permission and invoke.
 *
 * 4. **Auto-tracing.** Cognee records traces in the AgenticRetriever loop
 *    outside the dispatcher. Our pipeline optionally records a trace via
 *    TraceProvider, keeping trace recording co-located with execution.
 */

import type { ActionProvider, ActionExecutionResult } from "../providers/ActionProvider.js";
import type { PolicyMatcherProvider } from "../providers/PolicyMatcherProvider.js";
import type { RuleSolverProvider } from "../providers/RuleSolverProvider.js";
import type { TraceProvider } from "../providers/TraceProvider.js";
import { ActionScopeError } from "./errors.js";

export type PipelineStage = "scope" | "lookup" | "permission" | "validate" | "invoke";

export interface PipelineContext {
  action_name: string;
  params: Record<string, unknown>;
  session_id?: string;
  task_type?: string;
  completed_actions?: string[];
}

export interface PipelineResult {
  success: boolean;
  /** The stage that produced this outcome. */
  stage: PipelineStage;
  /** Populated when invoke stage was reached. */
  execution?: ActionExecutionResult;
  /** Populated on failure. */
  error?: {
    code: string;
    message: string;
    approval_type?: string;
    allowed_actions?: string[];
    validation_errors?: string[];
  };
  /** Duration of the full pipeline in ms. */
  duration_ms: number;
}

/**
 * Execute the full scope→lookup→permission→validate→invoke pipeline.
 *
 * Compared to cognee's execute_tool():
 * - Returns PipelineResult instead of raising exceptions.
 * - Integrates Letta rule-solver for scope checks (cognee uses
 *   `allowed_tools` list param; we query the rule solver live).
 * - Integrates Parlant-style policy matching for permission checks
 *   (cognee uses dataset ACLs; we use rule-based policy).
 * - Adds a validate stage between permission and invoke.
 * - Optionally records a trace via TraceProvider.
 */
export async function executeActionPipeline(
  ctx: PipelineContext,
  actionProvider: ActionProvider,
  policyMatcher: PolicyMatcherProvider,
  ruleSolver?: RuleSolverProvider,
  traceProvider?: TraceProvider,
): Promise<PipelineResult> {
  const start = performance.now();

  // ── Stage 1: Scope ──────────────────────────────────────────────
  // Cognee: `if allowed_tools is not None and tool_name not in allowed_tools`
  // Ours: query the Letta rule solver for the current task_type and
  // completed_actions to get a live allowed set.
  if (ruleSolver && ctx.task_type) {
    try {
      const result = await ruleSolver.getAllowedNext(
        ctx.task_type,
        ctx.completed_actions?.at(-1),
        ctx.completed_actions ?? [],
        {},
      );
      if (result.allowed.length > 0 && !result.allowed.includes(ctx.action_name)) {
        const err = new ActionScopeError(ctx.action_name, ctx.task_type, result.allowed);
        return {
          success: false,
          stage: "scope",
          duration_ms: elapsed(start),
          error: { code: err.code, message: err.message, allowed_actions: err.allowedActions },
        };
      }
    } catch (err) {
      if (err instanceof ActionScopeError) {
        return {
          success: false,
          stage: "scope",
          duration_ms: elapsed(start),
          error: { code: err.code, message: err.message, allowed_actions: err.allowedActions },
        };
      }
      // Rule solver errors are non-fatal; proceed to lookup.
    }
  }

  // ── Stage 2: Lookup ─────────────────────────────────────────────
  // Cognee: `tool = await get_tool(tool_name, dataset_id=dataset_id)`
  // Ours: query the ActionProvider registry.
  const schema = await actionProvider.get(ctx.action_name);
  if (!schema) {
    return {
      success: false,
      stage: "lookup",
      duration_ms: elapsed(start),
      error: { code: "ACTION_NOT_FOUND", message: `Action "${ctx.action_name}" not found in registry` },
    };
  }

  // ── Stage 3: Permission ─────────────────────────────────────────
  // Cognee: `get_authorized_existing_datasets(datasets=[dataset_id], ...)`
  // Ours: Parlant-style policy match → structured rules with approval types.
  const policyResult = await policyMatcher.checkPolicy(ctx.action_name, ctx.params);
  if (!policyResult.allowed) {
    return {
      success: false,
      stage: "permission",
      duration_ms: elapsed(start),
      error: {
        code: "ACTION_PERMISSION_ERROR",
        message: policyResult.reason,
        approval_type: policyResult.approval_type ?? undefined,
      },
    };
  }
  if (policyResult.requires_approval && schema.requires_approval) {
    return {
      success: false,
      stage: "permission",
      duration_ms: elapsed(start),
      error: {
        code: "ACTION_PERMISSION_ERROR",
        message: "Action requires platform approval",
        approval_type: policyResult.approval_type ?? undefined,
      },
    };
  }

  // ── Stage 4: Validate ───────────────────────────────────────────
  // No cognee equivalent — cognee validates inside the handler.
  const validation = await actionProvider.validate(ctx.action_name, ctx.params);
  if (!validation.valid) {
    return {
      success: false,
      stage: "validate",
      duration_ms: elapsed(start),
      error: {
        code: "ACTION_VALIDATION_ERROR",
        message: validation.errors.join("; "),
        validation_errors: validation.errors,
      },
    };
  }

  // ── Stage 5: Invoke ─────────────────────────────────────────────
  // Cognee: `return await handler(args, dataset=dataset, user=user, tool=tool)`
  // with ToolInvocationError wrapping.
  const result = await actionProvider.execute(ctx.action_name, ctx.params);
  const duration_ms = elapsed(start);

  // Auto-trace if a trace provider and session are available.
  if (traceProvider && ctx.session_id) {
    await traceProvider.recordToolCall(
      ctx.session_id,
      ctx.action_name,
      ctx.params,
      result.output as Record<string, unknown> ?? {},
      duration_ms,
    ).catch(() => {
      // Trace recording is best-effort; do not fail the pipeline.
    });
  }

  if (!result.success) {
    return {
      success: false,
      stage: "invoke",
      execution: result,
      duration_ms,
      error: {
        code: "ACTION_INVOCATION_ERROR",
        message: result.error ?? "Execution failed",
      },
    };
  }

  return { success: true, stage: "invoke", execution: result, duration_ms };
}

function elapsed(start: number): number {
  return Math.round(performance.now() - start);
}
