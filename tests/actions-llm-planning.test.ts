/**
 * Tests for LLM-first action planning.
 *
 * POST /actions/plan
 *   - rejects actions not in allowed_actions
 *   - accepts commit when commit is visible
 *   - supports finite, loop, open_ended modes
 *   - does not impose a small max-step cap
 *   - falls back to template when no LLM configured
 *
 * POST /actions/validate-plan
 *   - is deterministic (no LLM)
 *   - rejects unknown action names
 *   - rejects invalid params
 *   - validates requires_platform_validation invariant
 *
 * POST /actions/execute (if present) is clearly mock-only
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { actionRoutes } from "../src/actions/routes.js";
import { registerDefaultProviders } from "../src/providers/defaults.js";
import { resetProviderRegistry } from "../src/providers/registry.js";
import { ensureOutcomeTable } from "../src/actions/outcomeStore.js";
import { seedActionSchemas } from "../src/actions/actionSchemas.js";

let app: FastifyInstance;
const originalDeepSeekKey = process.env.DEEPSEEK_API_KEY;
const originalGeminiKey = process.env.GEMINI_API_KEY;

beforeAll(async () => {
  // Disable LLM clients to test template fallback path deterministically
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.GEMINI_API_KEY;

  resetProviderRegistry();
  registerDefaultProviders();
  seedActionSchemas();
  ensureOutcomeTable();
  app = Fastify();
  await app.register(actionRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  // Restore original env vars
  if (originalDeepSeekKey) process.env.DEEPSEEK_API_KEY = originalDeepSeekKey;
  if (originalGeminiKey) process.env.GEMINI_API_KEY = originalGeminiKey;
});

const ALL_ACTIONS = [
  "classify_task",
  "retrieve_context",
  "search_memory",
  "grep",
  "read_file",
  "write_file",
  "apply_patch",
  "run_tests",
  "summarize_diff",
  "request_approval",
  "commit",
];

// ── POST /actions/plan ──────────────────────────────────────────────

describe("POST /actions/plan — LLM-first planning", () => {
  it("returns a plan with template fallback when no LLM configured", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/plan",
      payload: {
        session_id: "s1",
        prompt: "Fix the login bug",
        allowed_actions: ["retrieve_context", "grep", "read_file", "run_tests"],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.plan).toBeDefined();
    expect(body.plan.steps.length).toBeGreaterThan(0);
    expect(body.requires_platform_validation).toBe(true);
    expect(body.source).toContain("validated_by_agent_core");
  });

  it("filters plan steps to only allowed actions", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/plan",
      payload: {
        session_id: "s1",
        prompt: "Fix bug",
        allowed_actions: ["grep", "read_file"],
      },
    });
    const body = res.json();
    expect(body.ok).toBe(true);
    for (const step of body.plan.steps) {
      expect(["grep", "read_file"]).toContain(step.action_name);
    }
  });

  it("allows commit when commit is in allowed_actions", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/plan",
      payload: {
        session_id: "s1",
        prompt: "Fix bug and commit",
        allowed_actions: ALL_ACTIONS,
        mode_preference: "finite",
      },
    });
    const body = res.json();
    expect(body.ok).toBe(true);
    // commit may or may not be in the template plan, but it's not rejected
    expect(body.errors).toEqual([]);
  });

  it("excludes commit steps when commit is not in allowed_actions", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/plan",
      payload: {
        session_id: "s1",
        prompt: "Fix bug",
        allowed_actions: ["grep", "read_file", "run_tests"],
      },
    });
    const body = res.json();
    expect(body.ok).toBe(true);
    const hasCommit = body.plan.steps.some((s: { action_name: string }) => s.action_name === "commit");
    expect(hasCommit).toBe(false);
  });

  it("supports finite mode_preference", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/plan",
      payload: {
        session_id: "s1",
        prompt: "Review code",
        allowed_actions: ALL_ACTIONS,
        mode_preference: "finite",
      },
    });
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.plan.mode).toBe("finite");
  });

  it("supports loop mode_preference", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/plan",
      payload: {
        session_id: "s1",
        prompt: "Keep improving until stopped",
        allowed_actions: ALL_ACTIONS,
        mode_preference: "loop",
      },
    });
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.plan.mode).toBe("loop");
  });

  it("supports open_ended mode_preference", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/plan",
      payload: {
        session_id: "s1",
        prompt: "Autonomous improvement",
        allowed_actions: ALL_ACTIONS,
        mode_preference: "open_ended",
      },
    });
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.plan.mode).toBe("open_ended");
  });

  it("all plan steps have requires_platform_validation=true", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/plan",
      payload: {
        session_id: "s1",
        prompt: "Fix bug",
        allowed_actions: ALL_ACTIONS,
      },
    });
    const body = res.json();
    for (const step of body.plan.steps) {
      expect(step.requires_platform_validation).toBe(true);
    }
  });

  it("includes warning about template fallback when no LLM configured", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/plan",
      payload: {
        session_id: "s1",
        prompt: "Fix bug",
        allowed_actions: ALL_ACTIONS,
      },
    });
    const body = res.json();
    expect(body.warnings.some((w: { message: string }) => w.message.includes("template fallback"))).toBe(true);
  });
});

// ── POST /actions/validate-plan ─────────────────────────────────────

describe("POST /actions/validate-plan — deterministic validation", () => {
  it("validates a correct finite plan", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/validate-plan",
      payload: {
        allowed_actions: ["grep", "read_file", "run_tests"],
        plan: {
          goal: "Find and fix bug",
          mode: "finite",
          steps: [
            { action_name: "grep", params: { pattern: "TODO" }, requires_platform_validation: true },
            { action_name: "read_file", params: { path: "src/index.ts" }, requires_platform_validation: true },
            { action_name: "run_tests", params: {}, requires_platform_validation: true },
          ],
        },
      },
    });
    const body = res.json();
    expect(body.valid).toBe(true);
    expect(body.errors).toEqual([]);
  });

  it("rejects unknown action names", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/validate-plan",
      payload: {
        allowed_actions: ["grep", "read_file"],
        plan: {
          goal: "Test",
          mode: "finite",
          steps: [
            { action_name: "nonexistent_action", params: {}, requires_platform_validation: true },
          ],
        },
      },
    });
    const body = res.json();
    expect(body.valid).toBe(false);
    expect(body.errors.some((e: string) => e.includes("nonexistent_action"))).toBe(true);
  });

  it("rejects actions not in allowed_actions", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/validate-plan",
      payload: {
        allowed_actions: ["grep"],
        plan: {
          goal: "Test",
          mode: "finite",
          steps: [
            { action_name: "commit", params: { message: "test" }, requires_platform_validation: true },
          ],
        },
      },
    });
    const body = res.json();
    expect(body.valid).toBe(false);
    expect(body.errors.some((e: string) => e.includes("commit"))).toBe(true);
  });

  it("rejects invalid params against Zod schema", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/validate-plan",
      payload: {
        allowed_actions: ["grep"],
        plan: {
          goal: "Test",
          mode: "finite",
          steps: [
            // grep requires pattern (min 1 char), passing empty string
            { action_name: "grep", params: { pattern: "" }, requires_platform_validation: true },
          ],
        },
      },
    });
    const body = res.json();
    expect(body.valid).toBe(false);
    expect(body.errors.some((e: string) => e.includes("grep"))).toBe(true);
  });

  it("validates loop mode plans", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/validate-plan",
      payload: {
        allowed_actions: ALL_ACTIONS,
        plan: {
          goal: "Continuously improve",
          mode: "loop",
          steps: [
            { action_name: "grep", params: { pattern: "TODO" }, requires_platform_validation: true },
            { action_name: "read_file", params: { path: "src/index.ts" }, requires_platform_validation: true },
            { action_name: "commit", params: { message: "fix" }, requires_platform_validation: true },
          ],
          loop_condition: "Continue until no TODOs remain.",
        },
      },
    });
    const body = res.json();
    expect(body.valid).toBe(true);
  });

  it("validates open_ended mode plans", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/validate-plan",
      payload: {
        allowed_actions: ALL_ACTIONS,
        plan: {
          goal: "Autonomous code improvement",
          mode: "open_ended",
          steps: [
            { action_name: "retrieve_context", params: {}, requires_platform_validation: true },
            { action_name: "grep", params: { pattern: "FIXME" }, requires_platform_validation: true },
            { action_name: "run_tests", params: {}, requires_platform_validation: true },
            { action_name: "commit", params: { message: "improvement" }, requires_platform_validation: true },
          ],
          loop_condition: "Continue improving until stopped.",
        },
      },
    });
    const body = res.json();
    expect(body.valid).toBe(true);
  });

  it("commit accepted only when commit is in allowed_actions", async () => {
    // With commit allowed
    const res1 = await app.inject({
      method: "POST",
      url: "/actions/validate-plan",
      payload: {
        allowed_actions: ["grep", "commit"],
        plan: {
          goal: "Test",
          mode: "finite",
          steps: [
            { action_name: "grep", params: { pattern: "x" }, requires_platform_validation: true },
            { action_name: "commit", params: { message: "done" }, requires_platform_validation: true },
          ],
        },
      },
    });
    expect(res1.json().valid).toBe(true);

    // Without commit allowed
    const res2 = await app.inject({
      method: "POST",
      url: "/actions/validate-plan",
      payload: {
        allowed_actions: ["grep"],
        plan: {
          goal: "Test",
          mode: "finite",
          steps: [
            { action_name: "grep", params: { pattern: "x" }, requires_platform_validation: true },
            { action_name: "commit", params: { message: "done" }, requires_platform_validation: true },
          ],
        },
      },
    });
    const body2 = res2.json();
    expect(body2.valid).toBe(false);
    expect(body2.errors.some((e: string) => e.includes("commit"))).toBe(true);
  });

  it("always returns requires_platform_validation=true in response", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/validate-plan",
      payload: {
        allowed_actions: ["grep"],
        plan: {
          goal: "Test",
          mode: "finite",
          steps: [
            { action_name: "grep", params: { pattern: "x" }, requires_platform_validation: true },
          ],
        },
      },
    });
    expect(res.json().requires_platform_validation).toBe(true);
  });
});

// ── POST /actions/execute — mock-only ──────────────────────────────

describe("POST /actions/execute — mock-only", () => {
  it("marks response as mock_contract_only", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/execute",
      payload: { action_name: "grep", params: { pattern: "test" } },
    });
    const body = res.json();
    expect(body.mock_contract_only).toBe(true);
    expect(body.production_execution_supported).toBe(false);
  });
});

// ── POST /actions/outcome ──────────────────────────────────────────

describe("POST /actions/outcome — record execution results", () => {
  it("records an outcome and returns outcome_id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/outcome",
      payload: {
        session_id: "test-session",
        action_name: "run_tests",
        params: { suite: "unit" },
        status: "succeeded",
        output: { passed: 42 },
        duration_ms: 1234,
        executor: "jubilant-goggles",
        rationale: "Validate before commit",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.recorded).toBe(true);
    expect(body.outcome_id).toBeDefined();
  });

  it("retrieves outcomes by session", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/actions/outcomes/test-session",
    });
    const body = res.json();
    expect(body.session_id).toBe("test-session");
    expect(body.outcomes.length).toBeGreaterThan(0);
  });
});

// ── GET /actions — catalog ─────────────────────────────────────────

describe("GET /actions — MCP-compatible catalog", () => {
  it("returns actions with requires_platform_validation=true", async () => {
    const res = await app.inject({ method: "GET", url: "/actions" });
    const body = res.json();
    expect(body.actions.length).toBeGreaterThan(0);
    for (const action of body.actions) {
      expect(action.requires_platform_validation).toBe(true);
      expect(action.name).toBeDefined();
      expect(action.params_json_schema).toBeDefined();
    }
  });
});

// ── GET /actions/:name ─────────────────────────────────────────────

describe("GET /actions/:name", () => {
  it("returns a single action definition", async () => {
    const res = await app.inject({ method: "GET", url: "/actions/grep" });
    const body = res.json();
    expect(body.name).toBe("grep");
    expect(body.params_json_schema).toBeDefined();
    expect(body.requires_platform_validation).toBe(true);
  });
});

// ── GET /providers ─────────────────────────────────────────────────

describe("GET /providers", () => {
  it("returns provider capability matrix", async () => {
    const res = await app.inject({ method: "GET", url: "/providers" });
    const body = res.json();
    expect(body.providers).toBeDefined();
    expect(Array.isArray(body.providers)).toBe(true);
    expect(body.providers.length).toBeGreaterThan(0);
    const names = body.providers.map((p: { name: string }) => p.name);
    expect(names).toContain("action");
    expect(names).toContain("ruleSolver");
  });
});
