/**
 * RuleSolverProvider interface.
 *
 * Expected implementations:
 *   - MockRuleSolverProvider (built-in, static sequences)
 *   - LettaRuleSolverAdapter (Phase 2, direct TS port of ToolRulesSolver)
 *
 * Reference: Letta ToolRulesSolver, tool_rule.py schemas
 *
 * Rule types (from Letta):
 *   - InitToolRule: tools allowed as first call
 *   - ChildToolRule: after tool X, only tools Y/Z are allowed
 *   - TerminalToolRule: tool ends the agent loop
 *   - ContinueToolRule: tool continues the loop
 *   - RequiredBeforeExitToolRule: must be called before agent exits
 *   - RequiresApprovalToolRule: triggers human-in-the-loop approval
 *   - ConditionalToolRule: allowed based on last function response
 *   - MaxCountPerStepToolRule: limit calls per step
 *   - ParentToolRule: filter tools from available set
 */

import type { ProviderStatus } from "./registry.js";

export interface ToolRule {
  id: string;
  task_type: string;
  sequence: string[];
  /** Actions allowed as the first call (empty = any in sequence). */
  init_actions: string[];
  before_exit: string[];
  approval_required: string[];
  conditions: Record<string, unknown>;
}

export interface AllowedActionsResult {
  allowed: string[];
  reason: string;
  requires_approval: string[];
  uncalled_required: string[];
}

/** Optional options bag for getAllowedNext — backward-compatible extension. */
export interface GetAllowedNextOptions {
  availableActions?: string[];
  lastFunctionResponse?: string;
}

export interface SequenceValidationResult {
  valid: boolean;
  violations: string[];
}

export interface RuleSolverProvider {
  readonly name: string;
  readonly status: ProviderStatus;

  getRule(task_type: string): Promise<ToolRule | null>;

  /**
   * Determine allowed next actions.
   *
   * @param task_type - Rule set to look up
   * @param current_action - Last executed action, or null/undefined for first action
   * @param history - Actions already executed in this session
   * @param options - availableActions (intersect filter) and/or lastFunctionResponse
   *   (for ConditionalToolRule). For backward compat, a string[] is treated as
   *   availableActions.
   */
  getAllowedNext(
    task_type: string,
    current_action: string | null | undefined,
    history?: string[],
    options?: string[] | GetAllowedNextOptions,
  ): Promise<AllowedActionsResult>;

  validateSequence(task_type: string, sequence: string[]): Promise<SequenceValidationResult>;
}
