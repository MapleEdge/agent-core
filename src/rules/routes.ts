import { FastifyInstance } from "fastify";
import { v4 as uuid } from "uuid";
import { getDb } from "../db.js";
import {
  ToolSequenceInput,
  AllowedNextInput,
  ValidateSequenceInput,
} from "../schemas/rules.js";

export async function rulesRoutes(app: FastifyInstance): Promise<void> {
  app.post("/rules/tool-sequence", async (req, reply) => {
    const input = ToolSequenceInput.parse(req.body);
    const id = uuid();
    const db = getDb();
    db.prepare(
      `INSERT INTO tool_rules (id, task_type, sequence, before_exit, approval_required, conditions)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.task_type,
      JSON.stringify(input.sequence),
      JSON.stringify(input.before_exit),
      JSON.stringify(input.approval_required),
      JSON.stringify(input.conditions),
    );
    reply.code(201);
    return { id, task_type: input.task_type };
  });

  app.get("/rules/tool-sequence/:rule_id", async (req) => {
    const { rule_id } = req.params as { rule_id: string };
    const db = getDb();
    const row = db.prepare(`SELECT * FROM tool_rules WHERE id = ?`).get(rule_id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return { error: "rule not found" };
    }
    return {
      ...row,
      sequence: JSON.parse(row.sequence as string),
      before_exit: JSON.parse(row.before_exit as string),
      approval_required: JSON.parse(row.approval_required as string),
      conditions: JSON.parse(row.conditions as string),
    };
  });

  app.post("/rules/allowed-next-actions", async (req) => {
    const input = AllowedNextInput.parse(req.body);
    const db = getDb();
    const rules = db
      .prepare(`SELECT * FROM tool_rules WHERE task_type = ?`)
      .all(input.task_type) as Record<string, unknown>[];

    if (rules.length === 0) {
      return { allowed: [], reason: "No rules defined for this task type" };
    }

    let allowed: string[] = [];
    let reason: string;

    for (const rule of rules) {
      const sequence = JSON.parse(rule.sequence as string) as string[];
      const beforeExit = JSON.parse(rule.before_exit as string) as string[];
      const approvalRequired = JSON.parse(rule.approval_required as string) as string[];

      if (!input.current_action) {
        // First action — return first element of sequence
        if (sequence.length > 0 && !allowed.includes(sequence[0])) {
          allowed.push(sequence[0]);
        }
      } else {
        const idx = sequence.indexOf(input.current_action);
        if (idx >= 0 && idx < sequence.length - 1) {
          const next = sequence[idx + 1];
          if (!allowed.includes(next)) {
            allowed.push(next);
          }
        }
      }

      // Intersect with available_actions when provided
      if (input.available_actions) {
        const availSet = new Set(input.available_actions);
        allowed = allowed.filter((a) => availSet.has(a));
      }

      const calledSet = new Set(input.completed_actions);
      const uncalled_required = beforeExit.filter((a) => !calledSet.has(a));
      const allowedSet = new Set(allowed);
      const requires_approval = approvalRequired.filter((a) => allowedSet.has(a));

      reason = !input.current_action
        ? "First action in sequence"
        : `Next in sequence after "${input.current_action}"`;

      return {
        task_type: input.task_type,
        current_action: input.current_action ?? null,
        allowed,
        reason,
        uncalled_required,
        requires_approval,
      };
    }

    return { allowed: [], reason: "No rules matched" };
  });

  app.post("/rules/validate-sequence", async (req) => {
    const input = ValidateSequenceInput.parse(req.body);
    const db = getDb();
    const rules = db
      .prepare(`SELECT * FROM tool_rules WHERE task_type = ?`)
      .all(input.task_type) as Record<string, unknown>[];

    if (rules.length === 0) {
      return { valid: true, reason: "No rules defined — sequence allowed by default" };
    }

    for (const rule of rules) {
      const sequence = JSON.parse(rule.sequence as string) as string[];
      const beforeExit = JSON.parse(rule.before_exit as string) as string[];
      const approvalRequired = JSON.parse(rule.approval_required as string) as string[];

      const violations: string[] = [];

      for (const action of input.proposed_sequence) {
        if (!sequence.includes(action)) {
          violations.push(`Action "${action}" not in allowed sequence`);
        }
      }

      for (const req of beforeExit) {
        if (!input.proposed_sequence.includes(req)) {
          violations.push(`Required before exit: "${req}" not in proposed sequence`);
        }
      }

      const needsApproval = input.proposed_sequence.filter((a) =>
        approvalRequired.includes(a),
      );

      return {
        valid: violations.length === 0,
        violations,
        needs_approval: needsApproval,
      };
    }

    return { valid: true };
  });
}

export function seedDefaultRules(): void {
  const db = getDb();
  const id = uuid();
  db.prepare(
    `INSERT OR IGNORE INTO tool_rules (id, task_type, sequence, before_exit, approval_required, conditions)
     VALUES (?, 'code_edit', ?, ?, ?, '{}')`,
  ).run(
    id,
    JSON.stringify([
      "classify_task",
      "read_file",
      "grep",
      "write_file",
      "run_tests",
      "summarize_diff",
      "request_approval",
      "commit",
    ]),
    JSON.stringify(["summarize_diff"]),
    JSON.stringify(["commit"]),
  );
}
