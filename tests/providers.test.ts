import { describe, it, expect, beforeEach } from "vitest";
import {
  registerProvider,
  getProvider,
  hasProvider,
  getCapabilityMatrix,
  listRegisteredProviders,
} from "../src/providers/registry.js";
import { MockMemoryProvider } from "../src/providers/mocks/MockMemoryProvider.js";
import { MockClassifierProvider } from "../src/providers/mocks/MockClassifierProvider.js";
import { MockRuleSolverProvider } from "../src/providers/mocks/MockRuleSolverProvider.js";
import {
  buildTimeline,
  filterByDepth,
  formatTimeline,
} from "../src/providers/adapters/ClaudeMemTimelineAdapter.js";
import type { TimelineEntry } from "../src/providers/adapters/ClaudeMemTimelineAdapter.js";

// ── Provider registry ──────────────────────────────────────────────

describe("Provider registry", () => {
  it("should register and retrieve a provider", () => {
    const mock = new MockMemoryProvider();
    registerProvider("memory", mock);
    expect(hasProvider("memory")).toBe(true);
    expect(getProvider("memory")).toBe(mock);
  });

  it("should throw for unregistered provider", () => {
    // context starts null from module load, but we registered memory above,
    // so test a slot we haven't touched:
    expect(() => getProvider("policyMatcher")).toThrow(/No provider registered/);
  });

  it("should list registered providers", () => {
    registerProvider("memory", new MockMemoryProvider());
    registerProvider("classifier", new MockClassifierProvider());
    const list = listRegisteredProviders();
    expect(list.memory).toBe("mock-memory");
    expect(list.classifier).toBe("mock-classifier");
  });

  it("should produce a capability matrix", () => {
    registerProvider("memory", new MockMemoryProvider());
    const matrix = getCapabilityMatrix();
    expect(matrix).toBeInstanceOf(Array);
    const mem = matrix.find((c) => c.name === "memory");
    expect(mem).toBeDefined();
    expect(mem!.provider).toBe("mock-memory");
    expect(mem!.status).toBe("mock");
  });
});

// ── Mock Memory Provider ───────────────────────────────────────────

describe("MockMemoryProvider", () => {
  let provider: MockMemoryProvider;

  beforeEach(() => {
    provider = new MockMemoryProvider();
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
    // These imports will fail at compile time if interfaces have errors
    const mod = await import("../src/providers/index.js");
    expect(mod.registerProvider).toBeDefined();
    expect(mod.getProvider).toBeDefined();
    expect(mod.hasProvider).toBeDefined();
    expect(mod.getCapabilityMatrix).toBeDefined();
    expect(mod.listRegisteredProviders).toBeDefined();
  });
});
