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
 *
 * 5. **Audit trail.** Every pipeline execution creates durable audit records
 *    at each stage transition: requested → validated → executed/failed.
 *
 * 6. **Rationale.** Each execution may carry a user-visible rationale explaining
 *    agent intent without exposing chain-of-thought.
 */

import type { ActionProvider, ActionExecutionResult } from "../providers/ActionProvider.js";
import type { PolicyMatcherProvider } from "../providers/PolicyMatcherProvider.js";
import type { RuleSolverProvider } from "../providers/RuleSolverProvider.js";
import type { TraceProvider } from "../providers/TraceProvider.js";
import type { SessionProvider } from "../providers/SessionProvider.js";
import { ActionScopeError } from "./errors.js";
import { createAuditRecord, updateAuditRecord, type ActionAuditRecord } from "./audit.js";

export type PipelineStage = "scope" | "lookup" | "permission" | "validate" | "invoke";

export interface PipelineContext {
  action_name: string;
  params: Record<string, unknown>;
  session_id?: string;
  user_id?: string;
  task_type?: string;
  completed_actions?: string[];
  rationale?: string;
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
    issues?: Array<{ path: string; message: string }>;
  };
  /** Duration of the full pipeline in ms. */
  duration_ms: number;
  /** User-visible rationale for this action execution. */
  rationale?: string;
  /** Audit record ID for this pipeline execution. */
  audit_id?: string;
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
 * - Creates durable audit records at each stage.
 * - Emits timeline events for session tracking.
 */
export async function executeActionPipeline(
  ctx: PipelineContext,
  actionProvider: ActionProvider,
  policyMatcher: PolicyMatcherProvider,
  ruleSolver?: RuleSolverProvider,
  traceProvider?: TraceProvider,
  sessionProvider?: SessionProvider,
): Promise<PipelineResult> {
  const start = performance.now();

  // Create initial audit record (requested)
  const audit = createAuditRecord({
    session_id: ctx.session_id,
    user_id: ctx.user_id,
    action_name: ctx.action_name,
    status: "requested",
    rationale: ctx.rationale,
    input: ctx.params,
  });

  // Emit ACTION_REQUESTED timeline event
  if (sessionProvider && ctx.session_id) {
    await emitTimelineEvent(sessionProvider, ctx.session_id, "ACTION_REQUESTED", {
      action_name: ctx.action_name,
      rationale: ctx.rationale ?? null,
      audit_id: audit.id,
    });
  }

  // ── Stage 1: Scope ──────────────────────────────────────────────
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
        updateAuditRecord(audit.id, { status: "failed", error: { code: err.code, message: err.message } });
        await emitFailedEvent(sessionProvider, ctx, audit, "scope");
        return {
          success: false,
          stage: "scope",
          duration_ms: elapsed(start),
          rationale: ctx.rationale,
          audit_id: audit.id,
          error: { code: err.code, message: err.message, allowed_actions: err.allowedActions },
        };
      }
    } catch (err) {
      if (err instanceof ActionScopeError) {
        updateAuditRecord(audit.id, { status: "failed", error: { code: err.code, message: err.message } });
        await emitFailedEvent(sessionProvider, ctx, audit, "scope");
        return {
          success: false,
          stage: "scope",
          duration_ms: elapsed(start),
          rationale: ctx.rationale,
          audit_id: audit.id,
          error: { code: err.code, message: err.message, allowed_actions: err.allowedActions },
        };
      }
      // Rule solver errors are non-fatal; proceed to lookup.
    }
  }

  // ── Stage 2: Lookup ─────────────────────────────────────────────
  const schema = await actionProvider.get(ctx.action_name);
  if (!schema) {
    updateAuditRecord(audit.id, {
      status: "failed",
      error: { code: "ACTION_NOT_FOUND", message: `Action "${ctx.action_name}" not found in registry` },
    });
    await emitFailedEvent(sessionProvider, ctx, audit, "lookup");
    return {
      success: false,
      stage: "lookup",
      duration_ms: elapsed(start),
      rationale: ctx.rationale,
      audit_id: audit.id,
      error: { code: "ACTION_NOT_FOUND", message: `Action "${ctx.action_name}" not found in registry` },
    };
  }

  // ── Stage 3: Permission ─────────────────────────────────────────
  const policyResult = await policyMatcher.checkPolicy(ctx.action_name, ctx.params);
  if (!policyResult.allowed) {
    updateAuditRecord(audit.id, {
      status: "failed",
      error: { code: "ACTION_PERMISSION_ERROR", message: policyResult.reason },
    });
    await emitFailedEvent(sessionProvider, ctx, audit, "permission");
    return {
      success: false,
      stage: "permission",
      duration_ms: elapsed(start),
      rationale: ctx.rationale,
      audit_id: audit.id,
      error: {
        code: "ACTION_PERMISSION_ERROR",
        message: policyResult.reason,
        approval_type: policyResult.approval_type ?? undefined,
      },
    };
  }
  if (policyResult.requires_approval && schema.requires_approval) {
    updateAuditRecord(audit.id, {
      status: "failed",
      error: { code: "ACTION_PERMISSION_ERROR", message: "Action requires platform approval" },
    });
    await emitFailedEvent(sessionProvider, ctx, audit, "permission");
    return {
      success: false,
      stage: "permission",
      duration_ms: elapsed(start),
      rationale: ctx.rationale,
      audit_id: audit.id,
      error: {
        code: "ACTION_PERMISSION_ERROR",
        message: "Action requires platform approval",
        approval_type: policyResult.approval_type ?? undefined,
      },
    };
  }

  // ── Stage 4: Validate ───────────────────────────────────────────
  const validation = await actionProvider.validate(ctx.action_name, ctx.params);
  if (!validation.valid) {
    updateAuditRecord(audit.id, {
      status: "failed",
      error: { code: "ACTION_VALIDATION_ERROR", issues: validation.issues, message: validation.errors.join("; ") },
    });
    await emitFailedEvent(sessionProvider, ctx, audit, "validate");
    return {
      success: false,
      stage: "validate",
      duration_ms: elapsed(start),
      rationale: ctx.rationale,
      audit_id: audit.id,
      error: {
        code: "ACTION_VALIDATION_ERROR",
        message: validation.errors.join("; "),
        validation_errors: validation.errors,
        issues: validation.issues,
      },
    };
  }

  // Update audit to validated
  updateAuditRecord(audit.id, { status: "validated" });

  // Emit ACTION_VALIDATED timeline event
  if (sessionProvider && ctx.session_id) {
    await emitTimelineEvent(sessionProvider, ctx.session_id, "ACTION_VALIDATED", {
      action_name: ctx.action_name,
      rationale: ctx.rationale ?? null,
      audit_id: audit.id,
    });
  }

  // ── Stage 5: Invoke ─────────────────────────────────────────────
  let result: Awaited<ReturnType<typeof actionProvider.execute>>;
  try {
    result = await actionProvider.execute(ctx.action_name, ctx.params);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateAuditRecord(audit.id, {
      status: "failed",
      error: { code: "ACTION_INVOCATION_ERROR", message },
    });
    await emitFailedEvent(sessionProvider, ctx, audit, "invoke");
    return {
      success: false,
      stage: "invoke",
      duration_ms: elapsed(start),
      rationale: ctx.rationale,
      audit_id: audit.id,
      error: { code: "ACTION_INVOCATION_ERROR", message },
    };
  }
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
    updateAuditRecord(audit.id, {
      status: "failed",
      output: result.output,
      error: { code: "ACTION_INVOCATION_ERROR", message: result.error ?? "Execution failed" },
    });
    if (sessionProvider && ctx.session_id) {
      await emitTimelineEvent(sessionProvider, ctx.session_id, "ACTION_FAILED", {
        action_name: ctx.action_name,
        rationale: ctx.rationale ?? null,
        status: "failed",
        audit_id: audit.id,
        error: result.error ?? "Execution failed",
      });
    }
    return {
      success: false,
      stage: "invoke",
      execution: result,
      duration_ms,
      rationale: ctx.rationale,
      audit_id: audit.id,
      error: {
        code: "ACTION_INVOCATION_ERROR",
        message: result.error ?? "Execution failed",
      },
    };
  }

  // Update audit to executed
  updateAuditRecord(audit.id, { status: "executed", output: result.output });

  // Emit ACTION_EXECUTED timeline event
  if (sessionProvider && ctx.session_id) {
    await emitTimelineEvent(sessionProvider, ctx.session_id, "ACTION_EXECUTED", {
      action_name: ctx.action_name,
      rationale: ctx.rationale ?? null,
      status: "executed",
      audit_id: audit.id,
    });
  }

  return {
    success: true,
    stage: "invoke",
    execution: result,
    duration_ms,
    rationale: ctx.rationale,
    audit_id: audit.id,
  };
}

function elapsed(start: number): number {
  return Math.round(performance.now() - start);
}

async function emitTimelineEvent(
  sessionProvider: SessionProvider,
  sessionId: string,
  eventType: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await sessionProvider.addEvent(sessionId, eventType, data);
  } catch {
    // Timeline events are best-effort; do not fail the pipeline.
  }
}

async function emitFailedEvent(
  sessionProvider: SessionProvider | undefined,
  ctx: PipelineContext,
  audit: ActionAuditRecord,
  failedStage: string,
): Promise<void> {
  if (sessionProvider && ctx.session_id) {
    await emitTimelineEvent(sessionProvider, ctx.session_id, "ACTION_FAILED", {
      action_name: ctx.action_name,
      rationale: ctx.rationale ?? null,
      status: "failed",
      failed_stage: failedStage,
      audit_id: audit.id,
    });
  }
}
