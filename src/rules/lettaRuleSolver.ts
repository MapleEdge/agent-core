/**
 * Letta-style ToolRulesSolver — deterministic TypeScript port.
 *
 * Ported from:
 *   vendor/providers/memory/letta/letta/helpers/tool_rule_solver.py
 *
 * Core algorithm:
 *   1. No history + init rules → only init tools allowed
 *   2. Otherwise → intersection of all child/parent/conditional/maxcount valid-tool sets
 *   3. Continue/terminal/required-before-exit are agent-loop flow controls, not tool restrictions
 *
 * Not ported:
 *   - Prefilled args cache (child_arg_nodes, per-rule args) — requires LLM integration
 *   - Block compilation (Letta Block type) — we produce plain string prompts
 *   - last_function_response for ConditionalToolRule — requires runtime response piping
 */

import type {
  LettaToolRule,
  InitToolRule,
  ChildToolRule,
  ParentToolRule,
  TerminalToolRule,
  ContinueToolRule,
  RequiredBeforeExitToolRule,
  RequiresApprovalToolRule,
  ConditionalToolRule,
  MaxCountPerStepToolRule,
} from "./lettaRuleTypes.js";

const COMPILED_PROMPT_DESCRIPTION =
  "The following constraints define rules for tool usage and guide desired behavior. These rules must be followed to ensure proper tool execution and workflow. A single response may contain multiple tool calls.";

export interface LettaSolverResult {
  allowed: string[];
  reason: string;
  uncalled_required: string[];
  requires_approval: string[];
  is_terminal: boolean;
  should_force_tool_call: boolean;
}

export class LettaRuleSolver {
  private readonly initRules: InitToolRule[] = [];
  private readonly childRules: ChildToolRule[] = [];
  private readonly parentRules: ParentToolRule[] = [];
  private readonly terminalRules: TerminalToolRule[] = [];
  private readonly continueRules: ContinueToolRule[] = [];
  private readonly requiredBeforeExitRules: RequiredBeforeExitToolRule[] = [];
  private readonly requiresApprovalRules: RequiresApprovalToolRule[] = [];
  private readonly conditionalRules: ConditionalToolRule[] = [];
  private readonly maxCountRules: MaxCountPerStepToolRule[] = [];

  constructor(rules: LettaToolRule[]) {
    for (const rule of rules) {
      switch (rule.type) {
        case "run_first":
          this.initRules.push(rule);
          break;
        case "constrain_child_tools":
          this.childRules.push(rule);
          break;
        case "parent_last_tool":
          this.parentRules.push(rule);
          break;
        case "exit_loop":
          this.terminalRules.push(rule);
          break;
        case "continue_loop":
          this.continueRules.push(rule);
          break;
        case "required_before_exit":
          this.requiredBeforeExitRules.push(rule);
          break;
        case "requires_approval":
          this.requiresApprovalRules.push(rule);
          break;
        case "conditional":
          this.conditionalRules.push(rule);
          break;
        case "max_count_per_step":
          this.maxCountRules.push(rule);
          break;
      }
    }
  }

  /**
   * Get allowed tool names given history and available tools.
   *
   * Follows Letta logic:
   *   1. No history + init rules → init tool names only
   *   2. Otherwise → intersection of child/parent/conditional/maxcount valid sets
   *   3. Intersect with availableTools
   */
  getAllowedToolNames(
    toolCallHistory: string[],
    availableTools: Set<string>,
    lastFunctionResponse?: string,
  ): string[] {
    if (toolCallHistory.length === 0 && this.initRules.length > 0) {
      return this.initRules.map((r) => r.tool_name);
    }

    const childBasedRules: LettaToolRule[] = [
      ...this.childRules,
      ...this.conditionalRules,
      ...this.maxCountRules,
    ];
    const allConstraintRules: LettaToolRule[] = [...childBasedRules, ...this.parentRules];

    const validSets: Set<string>[] = [];
    for (const rule of allConstraintRules) {
      const valid = this.getValidTools(rule, toolCallHistory, availableTools, lastFunctionResponse);
      validSets.push(valid);
    }

    let finalAllowed: Set<string>;
    if (validSets.length > 0) {
      finalAllowed = intersectSets(validSets);
    } else {
      finalAllowed = new Set(availableTools);
    }

    // Restrict to available tools
    finalAllowed = intersect(finalAllowed, availableTools);
    return [...finalAllowed];
  }

  /**
   * Full solver result matching the RuleSolverProvider interface.
   */
  solve(
    toolCallHistory: string[],
    availableTools: Set<string>,
    lastFunctionResponse?: string,
  ): LettaSolverResult {
    const allowed = this.getAllowedToolNames(toolCallHistory, availableTools, lastFunctionResponse);

    // Intersect allowed with availableTools (already done in getAllowedToolNames, but defensive)
    const allowedSet = new Set(allowed);

    const lastTool = toolCallHistory.length > 0 ? toolCallHistory[toolCallHistory.length - 1] : null;

    const reason = this.buildReason(toolCallHistory, allowed);
    const uncalled = this.getUncalledRequiredTools(toolCallHistory, availableTools);
    const approvalTools = this.requiresApprovalRules
      .map((r) => r.tool_name)
      .filter((t) => allowedSet.has(t));
    const isTerminal = lastTool !== null && this.isTerminalTool(lastTool);
    const shouldForce = this.shouldForceToolCall(toolCallHistory);

    return {
      allowed,
      reason,
      uncalled_required: uncalled,
      requires_approval: approvalTools,
      is_terminal: isTerminal,
      should_force_tool_call: shouldForce,
    };
  }

  isTerminalTool(toolName: string): boolean {
    return this.terminalRules.some((r) => r.tool_name === toolName);
  }

  isContinueTool(toolName: string): boolean {
    return this.continueRules.some((r) => r.tool_name === toolName);
  }

  isRequiresApprovalTool(toolName: string): boolean {
    return this.requiresApprovalRules.some((r) => r.tool_name === toolName);
  }

  hasChildrenTools(toolName: string): boolean {
    return this.childRules.some((r) => r.tool_name === toolName);
  }

  hasRequiredToolsBeenCalled(toolCallHistory: string[], availableTools: Set<string>): boolean {
    return this.getUncalledRequiredTools(toolCallHistory, availableTools).length === 0;
  }

  getUncalledRequiredTools(toolCallHistory: string[], availableTools: Set<string>): string[] {
    if (this.requiredBeforeExitRules.length === 0) return [];
    const required = new Set(this.requiredBeforeExitRules.map((r) => r.tool_name));
    const called = new Set(toolCallHistory);
    // Required tools that are available but not yet called
    return [...required].filter((t) => availableTools.has(t) && !called.has(t));
  }

  shouldForceToolCall(toolCallHistory: string[]): boolean {
    if (toolCallHistory.length === 0 && this.initRules.length > 0) return true;

    if (toolCallHistory.length > 0) {
      const lastTool = toolCallHistory[toolCallHistory.length - 1];
      for (const rule of this.childRules) {
        if (rule.tool_name === lastTool) return true;
      }
      for (const rule of this.conditionalRules) {
        if (rule.tool_name === lastTool) return true;
      }
      for (const rule of this.parentRules) {
        if (rule.tool_name === lastTool) return true;
      }
    }
    return false;
  }

  /**
   * Compile readable prompt summaries of all rules.
   */
  compilePrompt(): string | null {
    const lines: string[] = [];

    for (const rule of this.initRules) {
      lines.push(`<tool_rule>\n${rule.tool_name} must be used first\n</tool_rule>`);
    }
    for (const rule of this.continueRules) {
      lines.push(
        `<tool_rule>\n${rule.tool_name} requires continuing your response when called\n</tool_rule>`,
      );
    }
    for (const rule of this.childRules) {
      const children = rule.children.join(", ");
      lines.push(
        `<tool_rule>\nAfter using ${rule.tool_name}, you must use one of these tools: ${children}\n</tool_rule>`,
      );
    }
    for (const rule of this.conditionalRules) {
      lines.push(
        `<tool_rule>\n${rule.tool_name} will determine which tool to use next based on its output\n</tool_rule>`,
      );
    }
    for (const rule of this.maxCountRules) {
      lines.push(
        `<tool_rule>\n${rule.tool_name}: at most ${rule.max_count_limit} use(s) per response\n</tool_rule>`,
      );
    }
    for (const rule of this.parentRules) {
      const children = rule.children.join(", ");
      lines.push(
        `<tool_rule>\n${children} can only be used after ${rule.tool_name}\n</tool_rule>`,
      );
    }
    for (const rule of this.terminalRules) {
      lines.push(
        `<tool_rule>\n${rule.tool_name} ends your response (yields control) when called\n</tool_rule>`,
      );
    }
    for (const rule of this.requiredBeforeExitRules) {
      lines.push(
        `<tool_rule>${rule.tool_name} must be called before ending the conversation</tool_rule>`,
      );
    }

    if (lines.length === 0) return null;
    return `${COMPILED_PROMPT_DESCRIPTION}\n${lines.join("\n")}`;
  }

  /**
   * Validate a proposed sequence against the rules.
   */
  validateSequence(
    sequence: string[],
    availableTools: Set<string>,
  ): { valid: boolean; violations: string[] } {
    const violations: string[] = [];
    const history: string[] = [];

    for (let i = 0; i < sequence.length; i++) {
      const tool = sequence[i];
      const allowed = this.getAllowedToolNames(history, availableTools);

      if (allowed.length > 0 && !allowed.includes(tool)) {
        violations.push(
          `Step ${i}: "${tool}" not allowed (allowed: [${allowed.join(", ")}])`,
        );
      }
      history.push(tool);
    }

    // Check required-before-exit
    const uncalled = this.getUncalledRequiredTools(history, availableTools);
    for (const req of uncalled) {
      violations.push(`Required before exit: "${req}" not in proposed sequence`);
    }

    return { valid: violations.length === 0, violations };
  }

  // ── private helpers ────────────────────────────────────────────────

  private getValidTools(
    rule: LettaToolRule,
    history: string[],
    available: Set<string>,
    lastResponse?: string,
  ): Set<string> {
    const lastTool = history.length > 0 ? history[history.length - 1] : null;

    switch (rule.type) {
      case "constrain_child_tools":
        return lastTool === rule.tool_name
          ? new Set(rule.children)
          : available;

      case "parent_last_tool":
        return lastTool === rule.tool_name
          ? new Set(rule.children)
          : difference(available, new Set(rule.children));

      case "conditional":
        return this.getConditionalValidTools(rule, lastTool, available, lastResponse);

      case "max_count_per_step": {
        const count = history.filter((t) => t === rule.tool_name).length;
        return count >= rule.max_count_limit
          ? difference(available, new Set([rule.tool_name]))
          : available;
      }

      default:
        return available;
    }
  }

  private getConditionalValidTools(
    rule: ConditionalToolRule,
    lastTool: string | null,
    available: Set<string>,
    lastResponse?: string,
  ): Set<string> {
    if (lastTool !== rule.tool_name) return available;
    if (!lastResponse) {
      return rule.default_child ? new Set([rule.default_child]) : available;
    }

    // Try to parse JSON and extract message field (Letta convention)
    let output = lastResponse;
    try {
      const parsed = JSON.parse(lastResponse) as Record<string, unknown>;
      if (typeof parsed.message === "string") {
        output = parsed.message;
      }
    } catch {
      // Use raw response
    }

    for (const [key, tool] of Object.entries(rule.child_output_mapping)) {
      if (output === key) return new Set([tool]);
    }

    if (rule.require_output_mapping) return new Set();
    return rule.default_child ? new Set([rule.default_child]) : available;
  }

  private buildReason(history: string[], allowed: string[]): string {
    if (history.length === 0 && this.initRules.length > 0) {
      return "Init rules: only designated first tools allowed";
    }
    if (history.length === 0) {
      return "No history, no init rules: all available tools allowed";
    }
    const last = history[history.length - 1];
    if (allowed.length === 0) {
      return `No valid tools after "${last}"`;
    }
    return `Allowed after "${last}" per rule constraints`;
  }
}

// ── Set utilities ──────────────────────────────────────────────────

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const item of a) {
    if (b.has(item)) result.add(item);
  }
  return result;
}

function intersectSets(sets: Set<string>[]): Set<string> {
  if (sets.length === 0) return new Set();
  let result = new Set(sets[0]);
  for (let i = 1; i < sets.length; i++) {
    result = intersect(result, sets[i]);
  }
  return result;
}

function difference(a: Set<string>, b: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const item of a) {
    if (!b.has(item)) result.add(item);
  }
  return result;
}
