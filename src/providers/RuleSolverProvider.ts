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

export interface ToolRule {
  id: string;
  task_type: string;
  sequence: string[];
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

export interface SequenceValidationResult {
  valid: boolean;
  violations: string[];
}

export interface RuleSolverProvider {
  readonly name: string;

  getRule(task_type: string): Promise<ToolRule | null>;
  getAllowedNext(task_type: string, current_action: string, history?: string[]): Promise<AllowedActionsResult>;
  validateSequence(task_type: string, sequence: string[]): Promise<SequenceValidationResult>;
}
