import { FastifyInstance } from "fastify";
import { v4 as uuid } from "uuid";
import { getDb } from "../db.js";
import {
  PolicyMatchInput,
  PolicyCheckInput,
  ApprovalRequestInput,
} from "../schemas/policy.js";
import { getProvider } from "../providers/registry.js";

export async function policyRoutes(app: FastifyInstance): Promise<void> {
  app.post("/policy/match", async (req) => {
    const input = PolicyMatchInput.parse(req.body);
    const result = await getProvider("policyMatcher").match(input.action_name, {
      ...input.context,
      scope: input.scope,
    });

    return {
      action_name: input.action_name,
      matched_rules: result.matched_rules,
    };
  });

  app.post("/mock-platform/policy/check", async (req) => {
    const input = PolicyCheckInput.parse(req.body);
    return getProvider("policyMatcher").checkPolicy(input.action_name, input.params);
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
