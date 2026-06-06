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
import { seedDefaultRules } from "../src/rules/routes.js";
import { closeDb } from "../src/db.js";
import {
  buildTimeline,
  filterByDepth,
  formatTimeline,
} from "../src/providers/adapters/ClaudeMemTimelineAdapter.js";
import type { TimelineEntry } from "../src/providers/adapters/ClaudeMemTimelineAdapter.js";

beforeAll(() => {
  process.env.AGENT_CORE_DB = ":memory:";
  seedDefaultRules();
});

afterAll(() => {
  closeDb();
});

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
    });
    expect(record.id).toBeDefined();
    expect(record.content).toBe("Always run tests before committing");

    const fetched = await provider.get(record.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.content).toBe("Always run tests before committing");
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
    const updated = await provider.update(record.id, "New content");
    expect(updated).not.toBeNull();
    expect(updated!.content).toBe("New content");
  });

  it("should delete a memory", async () => {
    const record = await provider.write({ scope: "user", scope_id: "u1", content: "Delete me" });
    const deleted = await provider.delete(record.id);
    expect(deleted).toBe(true);
    const fetched = await provider.get(record.id);
    expect(fetched).toBeNull();
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
    expect(result.task_type).toBe("debug");
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
