/**
 * Cognee-inspired action error taxonomy.
 *
 * Reference: cognee execute_tool() dispatcher
 *   vendor/providers/knowledge/cognee/cognee/modules/tools/errors.py
 *   vendor/providers/knowledge/cognee/cognee/modules/tools/execute_tool.py
 *
 * Cognee defines four error types (ToolScopeError, ToolNotFoundError,
 * ToolPermissionError, ToolInvocationError) as bare exception subclasses.
 *
 * Our taxonomy adds:
 *   - Machine-readable `.code` string on every error for HTTP/JSON responses.
 *   - ActionValidationError for parameter validation failures (cognee checks
 *     params inside the handler; we validate before invocation).
 *   - Structured `.approvalType` on permission errors (Parlant-style approval
 *     metadata; cognee has no equivalent).
 *
 * Pipeline stages mapped: scope → lookup → permission → validate → invoke
 */

export class ActionError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "ActionError";
    this.code = code;
  }
}

/**
 * Action is not in the allowed set for the current task/rule scope.
 *
 * Cognee equivalent: ToolScopeError — "tool is not in the active
 * skill/tool scope for this turn" (execute_tool.py:62).
 *
 * Our version additionally includes the scope identifier and allowed
 * action list for debuggability.
 */
export class ActionScopeError extends ActionError {
  readonly allowedActions: string[];
  constructor(action: string, scope: string, allowedActions: string[] = []) {
    super(
      `Action "${action}" is not available in scope "${scope}"` +
        (allowedActions.length > 0 ? ` (allowed: ${allowedActions.join(", ")})` : ""),
      "ACTION_SCOPE_ERROR",
    );
    this.name = "ActionScopeError";
    this.allowedActions = allowedActions;
  }
}

/**
 * Action does not exist in the registry.
 *
 * Cognee equivalent: ToolNotFoundError — raised by registry.get_tool()
 * (registry.py:64-66).
 */
export class ActionNotFoundError extends ActionError {
  constructor(action: string) {
    super(`Action "${action}" not found in registry`, "ACTION_NOT_FOUND");
    this.name = "ActionNotFoundError";
  }
}

/**
 * Action exists but the caller lacks permission.
 *
 * Cognee equivalent: ToolPermissionError — checked via
 * get_authorized_existing_datasets() (execute_tool.py:67-75).
 *
 * Our version integrates Parlant-style policy matching and carries
 * the approval_type from the matched policy rule.
 */
export class ActionPermissionError extends ActionError {
  readonly approvalType: string | null;
  constructor(action: string, reason: string, approvalType?: string) {
    super(`Action "${action}" denied: ${reason}`, "ACTION_PERMISSION_ERROR");
    this.name = "ActionPermissionError";
    this.approvalType = approvalType ?? null;
  }
}

/**
 * Action parameters failed validation before execution.
 *
 * No cognee equivalent — cognee validates inside the handler.
 * Pre-invocation validation prevents unnecessary handler imports
 * and catches errors earlier in the pipeline.
 */
export class ActionValidationError extends ActionError {
  readonly validationErrors: string[];
  constructor(action: string, errors: string[]) {
    super(`Action "${action}" validation failed: ${errors.join("; ")}`, "ACTION_VALIDATION_ERROR");
    this.name = "ActionValidationError";
    this.validationErrors = errors;
  }
}

/**
 * Action was found, authorized, and validated, but execution itself failed.
 *
 * Cognee equivalent: ToolInvocationError — wraps handler exceptions
 * (execute_tool.py:86-88). Cognee re-raises ToolPermissionError and
 * ToolScopeError from inside the handler; we do not need this because
 * our pipeline checks those stages before invocation.
 */
export class ActionInvocationError extends ActionError {
  constructor(action: string, reason: string) {
    super(`Action "${action}" invocation failed: ${reason}`, "ACTION_INVOCATION_ERROR");
    this.name = "ActionInvocationError";
  }
}
