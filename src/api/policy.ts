import { FastifyInstance } from "fastify";
import { v4 as uuid } from "uuid";
import { getDb } from "../db.js";
import {
  PolicyMatchInput,
  PolicyCheckInput,
  ApprovalRequestInput,
} from "../schemas/policy.js";
import type { PolicyCheckResultType } from "../schemas/policy.js";

const DANGEROUS_ACTIONS = new Set([
  "deploy",
  "commit",
  "push",
  "delete_branch",
  "payment",
  "enter_credit_card",
  "access_secrets",
]);

export async function policyRoutes(app: FastifyInstance): Promise<void> {
  app.post("/policy/match", async (req) => {
    const input = PolicyMatchInput.parse(req.body);
    const db = getDb();
    const rules = db
      .prepare(`SELECT * FROM policy_rules WHERE scope = ? OR scope = 'global'`)
      .all(input.scope) as Record<string, unknown>[];

    const matched = rules.filter((r) => {
      const pattern = r.pattern as string;
      return input.action_name.includes(pattern) || pattern === "*";
    });

    return {
      action_name: input.action_name,
      matched_rules: matched.map((r) => ({
        id: r.id,
        pattern: r.pattern,
        action: r.action,
        reason: r.reason,
      })),
    };
  });

  app.post("/mock-platform/policy/check", async (req) => {
    const input = PolicyCheckInput.parse(req.body);
    const result = mockPolicyCheck(input.action_name);
    return result;
  });

  app.post("/mock-platform/approvals/request", async (req, reply) => {
    const input = ApprovalRequestInput.parse(req.body);
    const id = uuid();
    reply.code(201);
    return {
      approval_id: id,
      session_id: input.session_id,
      action_name: input.action_name,
      status: "pending",
      reason: input.reason,
      note: "[mock] Approval request created. In production, this would go to the platform approval queue.",
    };
  });
}

function mockPolicyCheck(actionName: string): PolicyCheckResultType {
  const isDangerous = DANGEROUS_ACTIONS.has(actionName);
  return {
    allowed: !isDangerous,
    requires_approval: isDangerous,
    approval_type: isDangerous ? "platform_review" : null,
    reason: isDangerous
      ? `Action "${actionName}" is gated by platform policy`
      : `Action "${actionName}" is allowed`,
    matched_rules: isDangerous ? [`deny:${actionName}`] : [],
  };
}

export function seedDefaultPolicies(): void {
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO policy_rules (id, scope, pattern, action, requires_approval, approval_type, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  insert.run(uuid(), "global", "commit", "gate", 1, "platform_review", "Commits require platform approval");
  insert.run(uuid(), "global", "deploy", "deny", 1, "deploy_review", "Deploys are blocked in phase 1");
  insert.run(uuid(), "global", "payment", "deny", 1, "payment_review", "Payment actions are never allowed here");
  insert.run(uuid(), "global", "access_secrets", "deny", 1, "security_review", "Secret access is platform-only");
}
