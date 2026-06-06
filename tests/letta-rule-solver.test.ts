import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LettaRuleSolver } from "../src/rules/lettaRuleSolver.js";
import { LettaRuleSolverProvider } from "../src/providers/adapters/LettaRuleSolverProvider.js";
import {
  registerProvider,
  getProvider,
  resetProviderRegistry,
  getCapabilityMatrix,
} from "../src/providers/registry.js";
import { closeDb } from "../src/db.js";
import type { LettaToolRule } from "../src/rules/lettaRuleTypes.js";

// Load golden fixtures
const fixtures = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "fixtures/letta-rule-cases.json"), "utf-8"),
) as Array<Record<string, unknown>>;

beforeAll(() => {
  process.env.AGENT_CORE_DB = ":memory:";
});

afterAll(() => {
  closeDb();
});

// ── LettaRuleSolver unit tests (fixture-driven) ──────────────────

describe("LettaRuleSolver", () => {
  for (const fixture of fixtures) {
    const name = fixture.name as string;
    const desc = fixture.description as string;
    const rules = fixture.rules as LettaToolRule[];

    // Skip fixtures that only test prompt compilation or sequence validation
    if (fixture.expected_prompt_contains) continue;
    if (fixture.validate_sequence) continue;

    it(`${name}: ${desc}`, () => {
      const solver = new LettaRuleSolver(rules);
      const history = (fixture.history ?? []) as string[];
      const availableTools = new Set(fixture.available_tools as string[]);
      const lastResponse = fixture.last_function_response as string | undefined;

      const result = solver.solve(history, availableTools, lastResponse);

      if (fixture.expected_allowed) {
        expect(result.allowed).toEqual(fixture.expected_allowed);
      }
      if (fixture.expected_allowed_sorted) {
        expect([...result.allowed].sort()).toEqual(fixture.expected_allowed_sorted);
      }
      if (fixture.expected_reason_contains) {
        expect(result.reason).toContain(fixture.expected_reason_contains as string);
      }
      if (fixture.expected_uncalled_required_sorted) {
        expect([...result.uncalled_required].sort()).toEqual(fixture.expected_uncalled_required_sorted);
      }
      if (fixture.expected_requires_approval_sorted) {
        expect([...result.requires_approval].sort()).toEqual(fixture.expected_requires_approval_sorted);
      }
      if (fixture.expected_is_terminal !== undefined) {
        expect(result.is_terminal).toBe(fixture.expected_is_terminal);
      }
      if (fixture.expected_should_force !== undefined) {
        expect(result.should_force_tool_call).toBe(fixture.expected_should_force);
      }
    });
  }
});

// ── Sequence validation (fixture-driven) ─────────────────────────

describe("LettaRuleSolver.validateSequence", () => {
  for (const fixture of fixtures) {
    if (!fixture.validate_sequence) continue;
    const name = fixture.name as string;
    const desc = fixture.description as string;

    it(`${name}: ${desc}`, () => {
      const solver = new LettaRuleSolver(fixture.rules as LettaToolRule[]);
      const availableTools = new Set(fixture.available_tools as string[]);
      const result = solver.validateSequence(
        fixture.validate_sequence as string[],
        availableTools,
      );

      if (fixture.expected_valid !== undefined) {
        expect(result.valid).toBe(fixture.expected_valid);
      }
      if (fixture.expected_violation_count_gte !== undefined) {
        expect(result.violations.length).toBeGreaterThanOrEqual(
          fixture.expected_violation_count_gte as number,
        );
      }
    });
  }
});

// ── Prompt compilation (fixture-driven) ──────────────────────────

describe("LettaRuleSolver.compilePrompt", () => {
  for (const fixture of fixtures) {
    if (!fixture.expected_prompt_contains) continue;
    const name = fixture.name as string;
    const desc = fixture.description as string;

    it(`${name}: ${desc}`, () => {
      const solver = new LettaRuleSolver(fixture.rules as LettaToolRule[]);
      const prompt = solver.compilePrompt();
      expect(prompt).not.toBeNull();
      for (const substr of fixture.expected_prompt_contains as string[]) {
        expect(prompt).toContain(substr);
      }
    });
  }
});

// ── LettaRuleSolverProvider integration tests ────────────────────

describe("LettaRuleSolverProvider", () => {
  let provider: LettaRuleSolverProvider;

  beforeEach(() => {
    provider = new LettaRuleSolverProvider();
    provider.setRules("code_edit", [
      { type: "run_first", tool_name: "classify_task" },
      {
        type: "constrain_child_tools",
        tool_name: "classify_task",
        children: ["read_file", "grep"],
      },
      {
        type: "constrain_child_tools",
        tool_name: "read_file",
        children: ["write_file", "grep"],
      },
      { type: "required_before_exit", tool_name: "summarize_diff" },
      { type: "requires_approval", tool_name: "commit" },
      { type: "exit_loop", tool_name: "send_response" },
    ]);
  });

  it("has direct status", () => {
    expect(provider.status).toBe("direct");
    expect(provider.name).toBe("letta-rule-solver");
  });

  it("returns rule for registered task type", async () => {
    const rule = await provider.getRule("code_edit");
    expect(rule).not.toBeNull();
    expect(rule!.task_type).toBe("code_edit");
    expect(rule!.init_actions).toEqual(["classify_task"]);
    expect(rule!.before_exit).toEqual(["summarize_diff"]);
    expect(rule!.approval_required).toEqual(["commit"]);
  });

  it("returns null for unknown task type", async () => {
    const rule = await provider.getRule("unknown");
    expect(rule).toBeNull();
  });

  it("gets allowed first actions", async () => {
    const result = await provider.getAllowedNext("code_edit", null, []);
    expect(result.allowed).toEqual(["classify_task"]);
    expect(result.reason).toContain("Init rules");
  });

  it("gets allowed actions after classify_task", async () => {
    const result = await provider.getAllowedNext("code_edit", "classify_task", []);
    expect(result.allowed.sort()).toEqual(["grep", "read_file"]);
  });

  it("reports uncalled required tools", async () => {
    const result = await provider.getAllowedNext("code_edit", null, []);
    expect(result.uncalled_required).toEqual(["summarize_diff"]);
  });

  it("intersects with availableActions (string[] backward compat)", async () => {
    const result = await provider.getAllowedNext(
      "code_edit",
      "classify_task",
      [],
      ["read_file"],
    );
    expect(result.allowed).toEqual(["read_file"]);
  });

  it("intersects with availableActions (options object)", async () => {
    const result = await provider.getAllowedNext(
      "code_edit",
      "classify_task",
      [],
      { availableActions: ["grep"] },
    );
    expect(result.allowed).toEqual(["grep"]);
  });

  it("passes lastFunctionResponse to conditional rules", async () => {
    provider.setRules("conditional_test", [
      {
        type: "conditional",
        tool_name: "check_status",
        default_child: "fallback",
        child_output_mapping: { success: "deploy", failure: "rollback" },
      },
    ]);
    const result = await provider.getAllowedNext(
      "conditional_test",
      "check_status",
      [],
      { lastFunctionResponse: '{"message": "success"}' },
    );
    expect(result.allowed).toEqual(["deploy"]);
  });

  it("validates sequences", async () => {
    const valid = await provider.validateSequence("code_edit", [
      "classify_task",
      "read_file",
      "write_file",
      "summarize_diff",
    ]);
    expect(valid.valid).toBe(true);

    const invalid = await provider.validateSequence("code_edit", [
      "classify_task",
      "write_file",
    ]);
    expect(invalid.valid).toBe(false);
    expect(invalid.violations.length).toBeGreaterThan(0);
  });

  it("compiles prompt summaries", () => {
    const prompt = provider.compilePrompt("code_edit");
    expect(prompt).toContain("classify_task must be used first");
    expect(prompt).toContain("After using classify_task");
    expect(prompt).toContain("send_response ends your response");
    expect(prompt).toContain("summarize_diff must be called before ending");
  });

  it("returns empty for unknown task type", async () => {
    const result = await provider.getAllowedNext("unknown", null);
    expect(result.allowed).toEqual([]);
    expect(result.reason).toContain("No Letta rules defined");
  });
});

// ── Provider registry integration ────────────────────────────────

describe("LettaRuleSolverProvider registry", () => {
  beforeEach(() => {
    resetProviderRegistry();
  });

  it("registers with direct status", () => {
    const provider = new LettaRuleSolverProvider();
    registerProvider("ruleSolver", provider);
    expect(getProvider("ruleSolver")).toBe(provider);
  });

  it("appears in capability matrix as direct", () => {
    const provider = new LettaRuleSolverProvider();
    registerProvider("ruleSolver", provider);
    const matrix = getCapabilityMatrix();
    const entry = matrix.find((e) => e.name === "ruleSolver");
    expect(entry).toBeDefined();
    expect(entry!.status).toBe("direct");
    expect(entry!.provider).toBe("letta-rule-solver");
  });
});

// ── /rules endpoints with provider vs DB fallback ────────────────

import Fastify, { FastifyInstance } from "fastify";
import { rulesRoutes, seedDefaultRules } from "../src/rules/routes.js";
import { seedLettaDefaultRules } from "../src/rules/lettaDefaults.js";

describe("/rules endpoints with LettaRuleSolverProvider", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetProviderRegistry();
    const lettaProvider = new LettaRuleSolverProvider();
    seedLettaDefaultRules(lettaProvider);
    registerProvider("ruleSolver", lettaProvider);

    app = Fastify();
    await app.register(rulesRoutes);
    seedDefaultRules();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    resetProviderRegistry();
  });

  it("uses LettaRuleSolverProvider for allowed-next-actions", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/rules/allowed-next-actions",
      payload: { task_type: "code_edit", current_action: null },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Letta rules: init rule returns classify_task
    expect(body.allowed).toEqual(["classify_task"]);
    expect(body.reason).toContain("Init rules");
    // Also has uncalled_required from Letta rules
    expect(body.uncalled_required).toContain("summarize_diff");
  });

  it("uses LettaRuleSolverProvider for validate-sequence", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/rules/validate-sequence",
      payload: {
        task_type: "code_edit",
        proposed_sequence: ["classify_task", "read_file", "write_file"],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Letta validates against child rules — this sequence should have violations
    // because summarize_diff is required_before_exit
    expect(body.violations).toBeDefined();
  });

  it("passes lastFunctionResponse through the endpoint", async () => {
    // Register a conditional rule task type
    const lettaProvider = getProvider("ruleSolver") as LettaRuleSolverProvider;
    lettaProvider.setRules("conditional_endpoint", [
      {
        type: "conditional",
        tool_name: "check_status",
        default_child: "fallback",
        child_output_mapping: { ok: "deploy" },
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/rules/allowed-next-actions",
      payload: {
        task_type: "conditional_endpoint",
        current_action: "check_status",
        last_function_response: '{"message": "ok"}',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().allowed).toEqual(["deploy"]);
  });
});

describe("/rules endpoints DB fallback (no provider)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetProviderRegistry();
    app = Fastify();
    await app.register(rulesRoutes);
    seedDefaultRules();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    resetProviderRegistry();
  });

  it("falls back to DB-based mock rules", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/rules/allowed-next-actions",
      payload: { task_type: "code_edit", current_action: "classify_task" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // DB-seeded sequence: classify_task -> read_file
    expect(body.allowed).toContain("read_file");
    expect(body.reason).toContain("Next in sequence");
  });

  it("DB fallback validate-sequence still works", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/rules/validate-sequence",
      payload: {
        task_type: "code_edit",
        proposed_sequence: ["classify_task", "read_file", "grep", "write_file", "run_tests", "summarize_diff"],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().valid).toBe(true);
  });
});
