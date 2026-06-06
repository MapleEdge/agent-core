import { getDb } from "../../db.js";
import type {
  RuleSolverProvider,
  ToolRule,
  AllowedActionsResult,
  SequenceValidationResult,
} from "../RuleSolverProvider.js";

export class MockRuleSolverProvider implements RuleSolverProvider {
  readonly name = "mock-rule-solver";

  async getRule(task_type: string): Promise<ToolRule | null> {
    const db = getDb();
    const row = db.prepare("SELECT * FROM tool_rules WHERE task_type = ?").get(task_type) as
      | { id: string; task_type: string; sequence: string; before_exit: string; approval_required: string; conditions: string }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      task_type: row.task_type,
      sequence: JSON.parse(row.sequence) as string[],
      before_exit: JSON.parse(row.before_exit) as string[],
      approval_required: JSON.parse(row.approval_required) as string[],
      conditions: JSON.parse(row.conditions) as Record<string, unknown>,
    };
  }

  async getAllowedNext(task_type: string, current_action: string, history?: string[]): Promise<AllowedActionsResult> {
    const rule = await this.getRule(task_type);
    if (!rule) {
      return { allowed: [], reason: `No rule found for task_type "${task_type}"`, requires_approval: [], uncalled_required: [] };
    }
    const idx = rule.sequence.indexOf(current_action);
    const allowed = idx >= 0 && idx < rule.sequence.length - 1
      ? [rule.sequence[idx + 1]]
      : rule.sequence;

    const calledSet = new Set(history ?? []);
    const uncalled_required = rule.before_exit.filter((a) => !calledSet.has(a));

    return {
      allowed,
      reason: idx >= 0 ? `Next in sequence after "${current_action}"` : "Full sequence available",
      requires_approval: rule.approval_required,
      uncalled_required,
    };
  }

  async validateSequence(task_type: string, sequence: string[]): Promise<SequenceValidationResult> {
    const rule = await this.getRule(task_type);
    if (!rule) {
      return { valid: false, violations: [`No rule found for task_type "${task_type}"`] };
    }
    const violations: string[] = [];
    for (let i = 0; i < sequence.length; i++) {
      if (!rule.sequence.includes(sequence[i])) {
        violations.push(`Action "${sequence[i]}" is not in the allowed sequence`);
      }
    }
    for (const req of rule.before_exit) {
      if (!sequence.includes(req)) {
        violations.push(`Required action "${req}" not found in sequence`);
      }
    }
    return { valid: violations.length === 0, violations };
  }
}
