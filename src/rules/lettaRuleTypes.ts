/**
 * Letta-style tool rule types.
 *
 * Ported from:
 *   vendor/providers/memory/letta/letta/schemas/tool_rule.py
 *   vendor/providers/memory/letta/letta/schemas/enums.py (ToolRuleType)
 *
 * Each rule type maps to a Letta ToolRuleType enum value.
 */

export type LettaRuleType =
  | "run_first"
  | "exit_loop"
  | "continue_loop"
  | "constrain_child_tools"
  | "parent_last_tool"
  | "conditional"
  | "max_count_per_step"
  | "required_before_exit"
  | "requires_approval";

interface BaseLettaRule {
  type: LettaRuleType;
  tool_name: string;
}

/** Tools allowed as the first call (no history). */
export interface InitToolRule extends BaseLettaRule {
  type: "run_first";
}

/** After tool_name, only children are allowed next. */
export interface ChildToolRule extends BaseLettaRule {
  type: "constrain_child_tools";
  children: string[];
}

/** children can only be called if tool_name was the last tool. */
export interface ParentToolRule extends BaseLettaRule {
  type: "parent_last_tool";
  children: string[];
}

/** Tool ends the agent loop when called. */
export interface TerminalToolRule extends BaseLettaRule {
  type: "exit_loop";
}

/** Tool continues the agent loop when called. */
export interface ContinueToolRule extends BaseLettaRule {
  type: "continue_loop";
}

/** Tool must be called before the agent loop can exit. */
export interface RequiredBeforeExitToolRule extends BaseLettaRule {
  type: "required_before_exit";
}

/** Tool requires human-in-the-loop approval. */
export interface RequiresApprovalToolRule extends BaseLettaRule {
  type: "requires_approval";
}

/**
 * Conditionally maps to different child tools based on last function response.
 * Simplified from Letta: we support string-keyed output mapping only.
 */
export interface ConditionalToolRule extends BaseLettaRule {
  type: "conditional";
  default_child: string | null;
  child_output_mapping: Record<string, string>;
  require_output_mapping?: boolean;
}

/** Limits how many times a tool can be called per step. */
export interface MaxCountPerStepToolRule extends BaseLettaRule {
  type: "max_count_per_step";
  max_count_limit: number;
}

export type LettaToolRule =
  | InitToolRule
  | ChildToolRule
  | ParentToolRule
  | TerminalToolRule
  | ContinueToolRule
  | RequiredBeforeExitToolRule
  | RequiresApprovalToolRule
  | ConditionalToolRule
  | MaxCountPerStepToolRule;
