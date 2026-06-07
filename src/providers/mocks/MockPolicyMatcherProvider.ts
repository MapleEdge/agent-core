import { getDb } from "../../db.js";
import type {
  PolicyMatcherProvider,
  PolicyMatchResult,
  PolicyRule,
} from "../PolicyMatcherProvider.js";
import type { ProviderStatus } from "../registry.js";

const DANGEROUS_ACTIONS = new Set([
  "deploy",
  "commit",
  "push",
  "delete_branch",
  "payment",
  "enter_credit_card",
  "access_secrets",
]);

interface PolicyRuleRow {
  id: string;
  scope: string;
  pattern: string;
  action: "allow" | "deny" | "require_approval" | "gate";
  requires_approval: number;
  approval_type: string | null;
  reason: string;
}

export class MockPolicyMatcherProvider implements PolicyMatcherProvider {
  readonly name = "mock-policy-matcher";
  readonly status: ProviderStatus = "mock";

  async match(action_name: string, context?: Record<string, unknown>): Promise<PolicyMatchResult> {
    const scope = typeof context?.scope === "string" ? context.scope : "global";
    const rows = getDb()
      .prepare("SELECT * FROM policy_rules WHERE scope = ? OR scope = 'global'")
      .all(scope) as PolicyRuleRow[];
    const matched_rules = rows
      .filter((row) => row.pattern === "*" || action_name.includes(row.pattern))
      .map((row) => this.mapRule(row));
    return this.toResult(action_name, matched_rules);
  }

  async checkPolicy(action_name: string, params: Record<string, unknown>): Promise<PolicyMatchResult> {
    return this.match(action_name, params);
  }

  private toResult(actionName: string, matched_rules: PolicyRule[]): PolicyMatchResult {
    const explicitDeny = matched_rules.find((rule) => rule.action === "deny");
    const approvalRule = matched_rules.find((rule) => rule.requires_approval || rule.action === "require_approval");
    const isDangerous = DANGEROUS_ACTIONS.has(actionName);
    const requires_approval = Boolean(approvalRule) || isDangerous;
    return {
      allowed: !explicitDeny && !isDangerous,
      requires_approval,
      approval_type: approvalRule?.approval_type ?? (isDangerous ? "platform_review" : null),
      reason: explicitDeny?.reason
        ?? approvalRule?.reason
        ?? (isDangerous ? `Action "${actionName}" is gated by platform policy` : `Action "${actionName}" is allowed`),
      matched_rules,
    };
  }

  private mapRule(row: PolicyRuleRow): PolicyRule {
    const action = row.action === "gate" ? "require_approval" : row.action;
    return {
      id: row.id,
      scope: row.scope,
      pattern: row.pattern,
      action,
      requires_approval: Boolean(row.requires_approval),
      approval_type: row.approval_type,
      reason: row.reason,
    };
  }
}
