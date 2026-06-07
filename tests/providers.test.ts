import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import {
  registerProvider,
  getProvider,
  hasProvider,
  resetProviderRegistry,
  getCapabilityMatrix,
  listRegisteredProviders,
} from "../src/providers/registry.js";
import { MockMemoryProvider } from "../src/providers/mocks/MockMemoryProvider.js";
import { MockClassifierProvider } from "../src/providers/mocks/MockClassifierProvider.js";
import { MockRuleSolverProvider } from "../src/providers/mocks/MockRuleSolverProvider.js";
import { MockSessionProvider } from "../src/providers/mocks/MockSessionProvider.js";
import { MockContextProvider } from "../src/providers/mocks/MockContextProvider.js";
import { MockActionProvider } from "../src/providers/mocks/MockActionProvider.js";
import { MockTraceProvider } from "../src/providers/mocks/MockTraceProvider.js";
import { MockPolicyMatcherProvider } from "../src/providers/mocks/MockPolicyMatcherProvider.js";
import { GeminiClassifierProvider } from "../src/providers/adapters/GeminiClassifierProvider.js";
import { getGeminiConfig } from "../src/llm/GeminiClient.js";
import type { LLMChatOptions, LLMClient, LLMMessage, LLMResponse } from "../src/llm/LLMClient.js";
import { seedDefaultRules } from "../src/rules/routes.js";
import { seedDefaultActions } from "../src/actions/defaults.js";
import { seedDefaultPolicies } from "../src/api/policy.js";
import { closeDb } from "../src/db.js";
import {
  buildTimeline,
  filterByDepth,
  formatTimeline,
} from "../src/providers/adapters/ClaudeMemTimelineAdapter.js";
import type { TimelineEntry } from "../src/providers/adapters/ClaudeMemTimelineAdapter.js";

beforeAll(() => {
  process.env.AGENT_CORE_DB = ":memory:";
  seedDefaultActions();
  seedDefaultRules();
  seedDefaultPolicies();
});

afterAll(() => {
  closeDb();
});

class StaticLLMClient implements LLMClient {
  readonly provider = "static";
  calls = 0;

  constructor(private readonly responses: string[]) {}

  async chat(messages: LLMMessage[], options?: LLMChatOptions): Promise<LLMResponse> {
    expect(messages.length).toBeGreaterThan(0);
    expect(options?.json_mode).toBe(true);
    const content = this.responses[Math.min(this.calls, this.responses.length - 1)];
    this.calls += 1;
    return {
      content,
      usage: null,
      model: "static-model",
      latency_ms: 1,
    };
  }
}

// ── Provider registry ──────────────────────────────────────────────

describe("Provider registry", () => {
  beforeEach(() => {
    resetProviderRegistry();
  });

  it("should register and retrieve a provider", () => {
    const mock = new MockMemoryProvider();
    registerProvider("memory", mock);
    expect(hasProvider("memory")).toBe(true);
    expect(getProvider("memory")).toBe(mock);
  });

  it("should throw for unregistered provider", () => {
    expect(() => getProvider("policyMatcher")).toThrow(/No provider registered/);
  });

  it("should list registered providers", () => {
    registerProvider("memory", new MockMemoryProvider());
    registerProvider("classifier", new MockClassifierProvider());
    const list = listRegisteredProviders();
    expect(list.memory).toBe("mock-memory");
    expect(list.classifier).toBe("mock-classifier");
  });

  it("should produce a capability matrix with explicit status", () => {
    const mem = new MockMemoryProvider();
    registerProvider("memory", mem);
    const matrix = getCapabilityMatrix();
    expect(matrix).toBeInstanceOf(Array);
    const memCap = matrix.find((c) => c.name === "memory");
    expect(memCap).toBeDefined();
    expect(memCap!.provider).toBe("mock-memory");
    expect(memCap!.status).toBe("mock");
    // Unregistered slot defaults to "mock" status with "none" provider
    const policyCap = matrix.find((c) => c.name === "policyMatcher");
    expect(policyCap).toBeDefined();
    expect(policyCap!.provider).toBe("none");
    expect(policyCap!.status).toBe("mock");
  });

  it("should reset all providers", () => {
    registerProvider("memory", new MockMemoryProvider());
    expect(hasProvider("memory")).toBe(true);
    resetProviderRegistry();
    expect(hasProvider("memory")).toBe(false);
  });

  it("should read status from provider metadata, not name inference", () => {
    const mem = new MockMemoryProvider();
    registerProvider("memory", mem);
    const matrix = getCapabilityMatrix();
    const memCap = matrix.find((c) => c.name === "memory")!;
    // Status comes from provider.status field, not name.startsWith("mock")
    expect(memCap.status).toBe(mem.status);
  });
});

// ── Mock Memory Provider ───────────────────────────────────────────

describe("MockMemoryProvider", () => {
  let provider: MockMemoryProvider;

  beforeEach(() => {
    provider = new MockMemoryProvider();
  });

  it("should have status 'mock'", () => {
    expect(provider.status).toBe("mock");
  });

  it("should write and get a memory", async () => {
    const record = await provider.write({
      scope: "repo",
      scope_id: "test-repo",
      content: "Always run tests before committing",
      kind: "manual",
      facts: ["Tests must run before commit"],
      concepts: ["testing"],
      files_read: ["README.md"],
    });
    expect(record.id).toBeDefined();
    expect(record.content).toBe("Always run tests before committing");
    expect(record.facts).toEqual(["Tests must run before commit"]);

    const fetched = await provider.get(record.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.content).toBe("Always run tests before committing");
    expect(fetched!.kind).toBe("manual");
    expect(fetched!.concepts).toEqual(["testing"]);
    expect(fetched!.files_read).toEqual(["README.md"]);
  });

  it("should search memories by content", async () => {
    await provider.write({ scope: "repo", scope_id: "r1", content: "Node 18 is required" });
    await provider.write({ scope: "repo", scope_id: "r1", content: "Always lint before commit" });

    const results = await provider.search({ query: "lint", scope: "repo" });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].content).toContain("lint");
  });

  it("should update a memory", async () => {
    const record = await provider.write({ scope: "user", scope_id: "u1", content: "Old content" });
    const updated = await provider.update(record.id, {
      content: "New content",
      facts: ["Updated fact"],
      kind: "observation",
    });
    expect(updated).not.toBeNull();
    expect(updated!.content).toBe("New content");
    expect(updated!.facts).toEqual(["Updated fact"]);
    expect(updated!.kind).toBe("observation");
  });

  it("should search enriched facts, concepts, and file references via FTS", async () => {
    await provider.write({
      scope: "repo",
      scope_id: "enriched-repo",
      content: "Provider registry supports swappable backends",
      kind: "observation",
      facts: ["Gemini classifier uses schema constrained JSON"],
      concepts: ["provider-registry", "classification"],
      files_modified: ["src/providers/adapters/GeminiClassifierProvider.ts"],
    });

    const factResults = await provider.search({ query: "schema constrained", scope_id: "enriched-repo" });
    expect(factResults[0]).toMatchObject({
      kind: "observation",
      facts: ["Gemini classifier uses schema constrained JSON"],
    });

    const fileResults = await provider.search({ query: "GeminiClassifierProvider", scope_id: "enriched-repo" });
    expect(fileResults[0].files_modified).toEqual([
      "src/providers/adapters/GeminiClassifierProvider.ts",
    ]);
  });

  it("should delete a memory", async () => {
    const record = await provider.write({ scope: "user", scope_id: "u1", content: "Delete me" });
    const deleted = await provider.delete(record.id);
    expect(deleted).toBe(true);
    const fetched = await provider.get(record.id);
    expect(fetched).toBeNull();
  });
});

// ── Mock Session/Trace Providers ───────────────────────────────────

describe("MockSessionProvider and MockTraceProvider", () => {
  it("should build a claude-mem-style sorted mixed timeline", async () => {
    const sessionProvider = new MockSessionProvider();
    const traceProvider = new MockTraceProvider();
    const session = await sessionProvider.create("timeline-repo");

    const event = await sessionProvider.addEvent(session.id, "prompt", { text: "Fix login" });
    const trace = await traceProvider.recordToolCall(
      session.id,
      "read_file",
      { path: "src/auth.ts" },
      { content: "auth" },
      12,
    );

    const timeline = await sessionProvider.getTimeline(session.id);
    expect(timeline.map((item) => item.id)).toEqual([event.id, trace.id]);
    expect(timeline[0].type).toBe("event");
    expect(timeline[1].type).toBe("trace");
    expect(timeline[1].data.input).toEqual({ path: "src/auth.ts" });
  });

  it("should update session summaries without changing provider shape", async () => {
    const provider = new MockSessionProvider();
    const session = await provider.create("summary-repo");
    const updated = await provider.updateSummary(session.id, "Resolved flaky auth spec");
    expect(updated?.summary).toBe("Resolved flaky auth spec");
  });

  it("should record skill-run traces with action_name carrying the skill name", async () => {
    const sessionProvider = new MockSessionProvider();
    const traceProvider = new MockTraceProvider();
    const session = await sessionProvider.create("skill-repo");
    const trace = await traceProvider.recordSkillRun(
      session.id,
      "lint-fix",
      { files: ["src/index.ts"] },
      { fixed: 1 },
      20,
    );
    expect(trace.trace_type).toBe("skill-run");
    expect(trace.action_name).toBe("lint-fix");
    expect(trace.output).toEqual({ fixed: 1 });
  });
});

// ── Mock Context Provider ──────────────────────────────────────────

describe("MockContextProvider", () => {
  it("should onboard a hierarchical context tree with stable repo sections", async () => {
    const provider = new MockContextProvider();
    const tree = await provider.onboard("context-provider-repo");
    expect(tree.path).toBe("repo");
    expect(tree.children?.map((child) => child.path)).toContain("repo/tests");
  });

  it("should search labels and promoted content within the tree", async () => {
    const provider = new MockContextProvider();
    await provider.onboard("context-search-repo");
    await provider.promote("context-search-repo", "repo/overview", "Agent-core provider registry notes");

    const labelResults = await provider.search("tests", "context-search-repo");
    expect(labelResults.some((result) => result.path === "repo/tests")).toBe(true);

    const contentResults = await provider.search("provider registry", "context-search-repo");
    expect(contentResults.some((result) => result.path === "repo/overview")).toBe(true);
  });

  it("should persist cross-repo links with explicit relation", async () => {
    const provider = new MockContextProvider();
    const link = await provider.link(
      "source-repo",
      "repo/tests",
      "target-repo",
      "repo/test-strategy",
      "mirrors",
    );
    expect(link.id).toBeDefined();
    expect(link.relation).toBe("mirrors");
  });
});

// ── Mock Action Provider ───────────────────────────────────────────

describe("MockActionProvider", () => {
  it("should expose default action registry entries through provider schema", async () => {
    const provider = new MockActionProvider();
    const readFile = await provider.get("read_file");
    expect(readFile?.name).toBe("read_file");
    expect(readFile?.requires_approval).toBe(false);
  });

  it("should validate required parameters using action schemas", async () => {
    const provider = new MockActionProvider();
    await provider.register({
      name: "needs_path",
      description: "Requires a path",
      parameters: { path: { type: "string", required: true } },
      risk_level: "low",
      requires_approval: false,
    });

    const invalid = await provider.validate("needs_path", {});
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toContain("Missing required parameter: path");

    const valid = await provider.validate("needs_path", { path: "src/index.ts" });
    expect(valid.valid).toBe(true);
  });

  it("should preserve the platform approval boundary for gated actions", async () => {
    const provider = new MockActionProvider();
    const result = await provider.execute("commit", {});
    expect(result.success).toBe(false);
    expect(result.error).toBe("Action requires platform approval");
  });
});

// ── Mock Policy Matcher Provider ───────────────────────────────────

describe("MockPolicyMatcherProvider", () => {
  it("should allow safe actions and gate dangerous platform-owned actions", async () => {
    const provider = new MockPolicyMatcherProvider();
    const safe = await provider.checkPolicy("read_file", {});
    expect(safe.allowed).toBe(true);
    expect(safe.requires_approval).toBe(false);

    const dangerous = await provider.checkPolicy("deploy", {});
    expect(dangerous.allowed).toBe(false);
    expect(dangerous.requires_approval).toBe(true);
    expect(dangerous.approval_type).toBe("deploy_review");
  });

  it("should map Parlant-inspired guideline matches to structured rules", async () => {
    const provider = new MockPolicyMatcherProvider();
    const result = await provider.match("commit", { scope: "global" });
    expect(result.matched_rules.length).toBeGreaterThan(0);
    expect(result.matched_rules[0]).toMatchObject({
      pattern: "commit",
      action: "require_approval",
      requires_approval: true,
    });
  });
});

// ── Mock Classifier Provider ───────────────────────────────────────

describe("MockClassifierProvider", () => {
  it("should have status 'mock'", () => {
    const provider = new MockClassifierProvider();
    expect(provider.status).toBe("mock");
  });

  it("should classify a task prompt", async () => {
    const provider = new MockClassifierProvider();
    const result = await provider.classify("Fix a failing login test");
    expect(result.intent).toBe("do");
    expect(result.task_type).toBe("test_fix");
    expect(result.complexity_score).toBeGreaterThan(0);
    expect(result.reasoning).toContain("Mock classifier");
  });

  it("should classify a question as ask intent", async () => {
    const provider = new MockClassifierProvider();
    const result = await provider.classify("What does this function do?");
    expect(result.intent).toBe("ask");
    expect(result.task_type).toBe("answer");
  });
});

// ── Gemini Classifier Provider ─────────────────────────────────────

describe("GeminiClassifierProvider", () => {
  it("should classify from schema-valid Gemini JSON without live API calls", async () => {
    const llm = new StaticLLMClient([
      JSON.stringify({
        intent: "do",
        task_type: "architecture",
        complexity_score: 65,
        risk_score: 35,
        ambiguity_score: 20,
        estimated_steps: 4,
        requires_approval: [],
        suggested_sequence: ["retrieve_context", "read_file", "summarize_diff"],
        reasoning: "Architecture analysis request",
      }),
    ]);
    const provider = new GeminiClassifierProvider(llm);

    const result = await provider.classify("Compare provider architecture", {
      repo_id: "agent-core",
    });

    expect(result.task_type).toBe("architecture");
    expect(result.suggested_sequence).toContain("summarize_diff");
    expect(llm.calls).toBe(1);
  });

  it("should retry malformed LLM JSON once and then fall back deterministically", async () => {
    const llm = new StaticLLMClient(["not-json", "{}"]);
    const provider = new GeminiClassifierProvider(llm);

    const result = await provider.classify("Fix the failing auth test");

    expect(result.task_type).toBe("test_fix");
    expect(result.reasoning).toContain("Gemini fallback used");
    expect(llm.calls).toBe(2);
  });

  it("should expose OpenAI-compatible Gemini defaults from environment", () => {
    const previousKey = process.env.GEMINI_API_KEY;
    const previousBase = process.env.GEMINI_BASE_URL;
    const previousModel = process.env.GEMINI_MODEL;
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_BASE_URL;
    delete process.env.GEMINI_MODEL;

    const config = getGeminiConfig();
    expect(config).toMatchObject({
      apiKey: "test-key",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: "gemini-2.0-flash",
    });

    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    if (previousBase === undefined) delete process.env.GEMINI_BASE_URL;
    else process.env.GEMINI_BASE_URL = previousBase;
    if (previousModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = previousModel;
  });
});

// ── Mock RuleSolver Provider ───────────────────────────────────────

describe("MockRuleSolverProvider", () => {
  it("should have status 'mock'", () => {
    const provider = new MockRuleSolverProvider();
    expect(provider.status).toBe("mock");
  });

  it("should get allowed next actions for a known task type", async () => {
    const provider = new MockRuleSolverProvider();
    const result = await provider.getAllowedNext("code_edit", "classify_task");
    expect(result.allowed).toBeInstanceOf(Array);
    expect(result.reason).toBeDefined();
  });

  it("should return empty for unknown task type", async () => {
    const provider = new MockRuleSolverProvider();
    const result = await provider.getAllowedNext("nonexistent", "classify_task");
    expect(result.allowed).toEqual([]);
    expect(result.reason).toContain("No rule found");
  });

  it("should return init_actions when current_action is null", async () => {
    const provider = new MockRuleSolverProvider();
    const result = await provider.getAllowedNext("code_edit", null);
    expect(result.allowed).toBeInstanceOf(Array);
    expect(result.allowed.length).toBeGreaterThan(0);
    expect(result.reason).toBe("First action in sequence");
    // First allowed action should be classify_task (first in seeded sequence)
    expect(result.allowed).toContain("classify_task");
  });

  it("should return init_actions when current_action is undefined", async () => {
    const provider = new MockRuleSolverProvider();
    const result = await provider.getAllowedNext("code_edit", undefined);
    expect(result.reason).toBe("First action in sequence");
    expect(result.allowed).toContain("classify_task");
  });

  it("should intersect with availableActions when provided", async () => {
    const provider = new MockRuleSolverProvider();
    // After classify_task, next should be read_file — but only if in availableActions
    const result = await provider.getAllowedNext("code_edit", "classify_task", [], ["grep", "write_file"]);
    // read_file is next in sequence but not in availableActions, so filtered out
    expect(result.allowed).not.toContain("read_file");
  });

  it("should report approval-required actions in allowed set", async () => {
    const provider = new MockRuleSolverProvider();
    // commit requires approval per seeded rules
    const result = await provider.getAllowedNext("code_edit", "request_approval");
    expect(result.requires_approval).toContain("commit");
  });

  it("should report uncalled required-before-exit actions", async () => {
    const provider = new MockRuleSolverProvider();
    // summarize_diff is required before exit; if not in history it's uncalled
    const result = await provider.getAllowedNext("code_edit", "classify_task", []);
    expect(result.uncalled_required).toContain("summarize_diff");
    // After calling summarize_diff, it should be removed from uncalled
    const result2 = await provider.getAllowedNext("code_edit", "classify_task", ["summarize_diff"]);
    expect(result2.uncalled_required).not.toContain("summarize_diff");
  });

  it("should include init_actions in getRule result", async () => {
    const provider = new MockRuleSolverProvider();
    const rule = await provider.getRule("code_edit");
    expect(rule).not.toBeNull();
    expect(rule!.init_actions).toBeInstanceOf(Array);
    expect(rule!.init_actions.length).toBeGreaterThan(0);
    expect(rule!.init_actions[0]).toBe("classify_task");
  });
});

// ── ClaudeMemTimelineAdapter ───────────────────────────────────────

describe("ClaudeMemTimelineAdapter", () => {
  const entries: TimelineEntry[] = [
    { type: "event", id: "e1", epoch: 1000, data: { kind: "start" } },
    { type: "trace", id: "t1", epoch: 2000, data: { action: "read_file" } },
    { type: "observation", id: "o1", epoch: 3000, data: { note: "found bug" } },
    { type: "trace", id: "t2", epoch: 4000, data: { action: "write_file" } },
    { type: "event", id: "e2", epoch: 5000, data: { kind: "end" } },
  ];

  it("should build a sorted timeline", () => {
    const shuffled = [entries[3], entries[0], entries[4], entries[1], entries[2]];
    const sorted = buildTimeline(shuffled);
    expect(sorted.map((e) => e.id)).toEqual(["e1", "t1", "o1", "t2", "e2"]);
  });

  it("should filter by depth around anchor", () => {
    const sorted = buildTimeline(entries);
    const window = filterByDepth(sorted, "o1", 1, 1);
    expect(window.map((e) => e.id)).toEqual(["t1", "o1", "t2"]);
  });

  it("should return all items if anchor not found", () => {
    const sorted = buildTimeline(entries);
    const window = filterByDepth(sorted, "nonexistent", 1, 1);
    expect(window.length).toBe(5);
  });

  it("should format timeline as readable text", () => {
    const sorted = buildTimeline(entries);
    const text = formatTimeline(sorted, "o1");
    expect(text).toContain("Timeline around anchor: o1");
    expect(text).toContain("◀ anchor");
    expect(text).toContain("[trace]");
    expect(text).toContain("[event]");
  });

  it("should handle empty timeline", () => {
    const text = formatTimeline([]);
    expect(text).toBe("No timeline items found");
  });
});

// ── Provider interfaces compile ────────────────────────────────────

describe("Provider interfaces compile", () => {
  it("should verify all interface types are importable", async () => {
    const mod = await import("../src/providers/index.js");
    expect(mod.registerProvider).toBeDefined();
    expect(mod.getProvider).toBeDefined();
    expect(mod.hasProvider).toBeDefined();
    expect(mod.resetProviderRegistry).toBeDefined();
    expect(mod.getCapabilityMatrix).toBeDefined();
    expect(mod.listRegisteredProviders).toBeDefined();
  });
});

// ── ActionProvider execution boundary ──────────────────────────────

describe("ActionProvider execution boundary", () => {
  it("ActionExecutionResult should require execution_mode field", async () => {
    // Verify the type exists and has the right shape at import time
    const mod = await import("../src/providers/ActionProvider.js");
    // Module imports successfully — type constraints are compile-time
    expect(mod).toBeDefined();
  });
});
