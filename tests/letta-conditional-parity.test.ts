import { describe, expect, it, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { LettaRuleSolver, LettaRuleSolverError } from "../src/rules/lettaRuleSolver.js";
import type { LettaToolRule } from "../src/rules/lettaRuleTypes.js";
import { LettaRuleSolverProvider } from "../src/providers/adapters/LettaRuleSolverProvider.js";
import { registerProvider, resetProviderRegistry } from "../src/providers/registry.js";
import { rulesRoutes } from "../src/rules/routes.js";

const conditionalRules: LettaToolRule[] = [
  {
    type: "conditional",
    tool_name: "check_status",
    default_child: "fallback",
    child_output_mapping: { ok: "deploy" },
  },
];

const available = new Set(["check_status", "deploy", "fallback"]);

describe("Letta conditional rule parity", () => {
  it("core solver throws when a matching conditional rule has no lastFunctionResponse", () => {
    const solver = new LettaRuleSolver(conditionalRules);

    expect(() => solver.getAllowedToolNames(["check_status"], available)).toThrow(
      LettaRuleSolverError,
    );
  });

  it("core solver does not use default_child when lastFunctionResponse is missing", () => {
    const solver = new LettaRuleSolver(conditionalRules);

    expect(() => solver.solve(["check_status"], available)).toThrow(
      /requires lastFunctionResponse/,
    );
  });

  it("provider converts missing lastFunctionResponse into empty allowed set", async () => {
    const provider = new LettaRuleSolverProvider();
    provider.setRules("conditional", conditionalRules);

    const result = await provider.getAllowedNext("conditional", "check_status", []);

    expect(result.allowed).toEqual([]);
    expect(result.reason).toContain("requires lastFunctionResponse");
  });

  it("provider still routes when lastFunctionResponse is supplied", async () => {
    const provider = new LettaRuleSolverProvider();
    provider.setRules("conditional", conditionalRules);

    const result = await provider.getAllowedNext("conditional", "check_status", [], {
      lastFunctionResponse: '{"message":"ok"}',
    });

    expect(result.allowed).toEqual(["deploy"]);
  });
});

describe("/rules conditional parity", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    resetProviderRegistry();
    const provider = new LettaRuleSolverProvider();
    provider.setRules("conditional", conditionalRules);
    registerProvider("ruleSolver", provider);

    app = Fastify();
    await app.register(rulesRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    resetProviderRegistry();
  });

  it("does not allow default_child through endpoint when last_function_response is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/rules/allowed-next-actions",
      payload: {
        task_type: "conditional",
        current_action: "check_status",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.allowed).toEqual([]);
    expect(body.reason).toContain("requires lastFunctionResponse");
  });

  it("passes last_function_response through endpoint to conditional rules", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/rules/allowed-next-actions",
      payload: {
        task_type: "conditional",
        current_action: "check_status",
        last_function_response: '{"message":"ok"}',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().allowed).toEqual(["deploy"]);
  });
});
