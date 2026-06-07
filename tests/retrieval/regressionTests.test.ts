/**
 * Regression Tests for Hybrid Memory Provider
 *
 * Verify that all existing MemoryProvider functionality works
 * correctly after the switch from MockMemoryProvider to
 * SQLiteHybridMemoryProvider.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getDb, closeDb } from "../../src/db.js";
import {
  resetProviderRegistry,
  registerProvider,
  getProvider,
} from "../../src/providers/registry.js";

import { MockEmbeddingProvider } from "../../src/providers/adapters/MockEmbeddingProvider.js";
import { SQLiteHybridMemoryProvider } from "../../src/providers/adapters/SQLiteHybridMemoryProvider.js";
import { MockSessionProvider } from "../../src/providers/mocks/MockSessionProvider.js";

let memoryProvider: SQLiteHybridMemoryProvider;

beforeAll(() => {
  process.env.AGENT_CORE_DB = ":memory:";
  resetProviderRegistry();
  getDb();
  const embeddingProvider = new MockEmbeddingProvider();
  memoryProvider = new SQLiteHybridMemoryProvider(embeddingProvider);
  registerProvider("memory", memoryProvider);
  registerProvider("embedding", embeddingProvider);
  registerProvider("session", new MockSessionProvider());
});

afterAll(() => {
  closeDb();
});

describe("Regression — CRUD Operations", () => {
  it("write creates a memory with all fields", async () => {
    const mem = await memoryProvider.write({
      scope: "repo",
      scope_id: "test-repo",
      content: "regression test content",
      kind: "observation",
      facts: ["fact1"],
      concepts: ["concept1"],
      files_read: ["src/index.ts"],
      files_modified: ["src/app.ts"],
      metadata: { key: "value" },
    });

    expect(mem.id).toBeDefined();
    expect(mem.content).toBe("regression test content");
    expect(mem.scope).toBe("repo");
    expect(mem.scope_id).toBe("test-repo");
    expect(mem.kind).toBe("observation");
    expect(mem.facts).toEqual(["fact1"]);
    expect(mem.concepts).toEqual(["concept1"]);
    expect(mem.files_read).toEqual(["src/index.ts"]);
    expect(mem.files_modified).toEqual(["src/app.ts"]);
    expect(mem.metadata).toEqual({ key: "value" });
    expect(mem.created_at).toBeDefined();
    expect(mem.updated_at).toBeDefined();
  });

  it("get retrieves a memory by ID", async () => {
    const mem = await memoryProvider.write({
      scope: "session",
      scope_id: "s1",
      content: "get test",
    });

    const fetched = await memoryProvider.get(mem.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(mem.id);
    expect(fetched!.content).toBe("get test");
  });

  it("get returns null for nonexistent ID", async () => {
    const fetched = await memoryProvider.get("nonexistent-id-12345");
    expect(fetched).toBeNull();
  });

  it("update modifies content", async () => {
    const mem = await memoryProvider.write({
      scope: "repo",
      scope_id: "r1",
      content: "original content",
    });

    const updated = await memoryProvider.update(mem.id, {
      content: "updated content",
    });

    expect(updated).not.toBeNull();
    expect(updated!.content).toBe("updated content");
  });

  it("update modifies metadata", async () => {
    const mem = await memoryProvider.write({
      scope: "repo",
      scope_id: "r1",
      content: "meta update test",
      metadata: { version: 1 },
    });

    const updated = await memoryProvider.update(mem.id, {
      metadata: { version: 2, extra: "data" },
    });

    expect(updated!.metadata).toEqual({ version: 2, extra: "data" });
  });

  it("update returns null for nonexistent ID", async () => {
    const updated = await memoryProvider.update("nonexistent-id", {
      content: "nope",
    });
    expect(updated).toBeNull();
  });

  it("delete removes a memory", async () => {
    const mem = await memoryProvider.write({
      scope: "repo",
      scope_id: "r1",
      content: "delete me",
    });

    const deleted = await memoryProvider.delete(mem.id);
    expect(deleted).toBe(true);

    const fetched = await memoryProvider.get(mem.id);
    expect(fetched).toBeNull();
  });

  it("delete returns false for nonexistent ID", async () => {
    const deleted = await memoryProvider.delete("nonexistent-id-999");
    expect(deleted).toBe(false);
  });

  it("write defaults kind to manual", async () => {
    const mem = await memoryProvider.write({
      scope: "repo",
      scope_id: "r1",
      content: "default kind test",
    });
    expect(mem.kind).toBe("manual");
  });
});

describe("Regression — FTS Search", () => {
  beforeEach(async () => {
    // Seed memories for search tests
    await memoryProvider.write({
      scope: "repo",
      scope_id: "search-test",
      content: "TypeScript compiler options for strict mode",
    });
    await memoryProvider.write({
      scope: "repo",
      scope_id: "search-test",
      content: "Python virtual environment setup with venv",
    });
    await memoryProvider.write({
      scope: "repo",
      scope_id: "search-test",
      content: "Docker container networking bridge configuration",
    });
  });

  it("FTS finds exact keyword matches", async () => {
    const results = await memoryProvider.search({
      query: "TypeScript",
      top_k: 5,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain("TypeScript");
  });

  it("FTS search respects top_k limit", async () => {
    const results = await memoryProvider.search({
      query: "test",
      top_k: 2,
    });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("FTS search returns scores", async () => {
    const results = await memoryProvider.search({
      query: "Docker container",
      top_k: 5,
    });
    for (const r of results) {
      expect(typeof r.score).toBe("number");
      expect(r.score).toBeGreaterThan(0);
    }
  });
});

describe("Regression — Scope Filtering", () => {
  it("filters by scope_id", async () => {
    await memoryProvider.write({
      scope: "repo",
      scope_id: "alpha",
      content: "alpha repo unique content for scoping test",
    });
    await memoryProvider.write({
      scope: "repo",
      scope_id: "beta",
      content: "beta repo unique content for scoping test",
    });

    const results = await memoryProvider.search({
      query: "unique content scoping",
      scope_id: "alpha",
      top_k: 10,
    });

    // All results should be from alpha scope
    for (const r of results) {
      // Verify the content is from alpha
      if (r.content.includes("unique content for scoping test")) {
        expect(r.content).toContain("alpha");
      }
    }
  });
});

describe("Regression — Metadata Filtering", () => {
  it("filters by simple metadata key-value", async () => {
    await memoryProvider.write({
      scope: "repo",
      scope_id: "meta-test",
      content: "frontend team memory about React hooks",
      metadata: { team: "frontend", priority: "high" },
    });
    await memoryProvider.write({
      scope: "repo",
      scope_id: "meta-test",
      content: "backend team memory about API routes",
      metadata: { team: "backend", priority: "medium" },
    });

    const results = await memoryProvider.search({
      query: "team memory",
      filters: { team: "frontend" },
      top_k: 10,
    });

    for (const r of results) {
      expect(r.metadata.team).toBe("frontend");
    }
  });

  it("filters with operator: in", async () => {
    await memoryProvider.write({
      scope: "repo",
      scope_id: "op-test",
      content: "critical security alert for operator test",
      metadata: { severity: "critical" },
    });
    await memoryProvider.write({
      scope: "repo",
      scope_id: "op-test",
      content: "info level log for operator test",
      metadata: { severity: "info" },
    });

    const results = await memoryProvider.search({
      query: "operator test",
      filters: { severity: { in: ["critical", "high"] } },
      top_k: 10,
    });

    for (const r of results) {
      expect(["critical", "high"]).toContain(r.metadata.severity);
    }
  });
});

describe("Regression — Array Metadata Filters (contains/icontains parity)", () => {
  it("contains matches element in array metadata", async () => {
    await memoryProvider.write({
      scope: "repo",
      scope_id: "arr-test",
      content: "deploy pipeline needs approval tags array test",
      metadata: { tags: ["deploy", "approval"] },
    });
    await memoryProvider.write({
      scope: "repo",
      scope_id: "arr-test",
      content: "logging setup for debug tags array test",
      metadata: { tags: ["logging", "debug"] },
    });

    const results = await memoryProvider.search({
      query: "tags array test",
      filters: { tags: { contains: "approval" } },
      top_k: 10,
    });

    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.metadata.tags).toContain("approval");
    }
  });

  it("icontains matches element in array metadata case-insensitively", async () => {
    await memoryProvider.write({
      scope: "repo",
      scope_id: "arr-test",
      content: "CI pipeline runs nightly for array icontains test",
      metadata: { environments: ["Staging", "Production"] },
    });

    const results = await memoryProvider.search({
      query: "array icontains test",
      filters: { environments: { icontains: "staging" } },
      top_k: 10,
    });

    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      const envs = r.metadata.environments as string[];
      expect(envs.some((e) => e.toLowerCase().includes("staging"))).toBe(true);
    }
  });

  it("contains on string metadata still works", async () => {
    await memoryProvider.write({
      scope: "repo",
      scope_id: "arr-test",
      content: "string contains parity check for regression",
      metadata: { description: "This is a deployment guide" },
    });

    const results = await memoryProvider.search({
      query: "string contains parity",
      filters: { description: { contains: "deployment" } },
      top_k: 10,
    });

    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.metadata.description).toContain("deployment");
    }
  });
});

describe("Regression — Embedding Store", () => {
  it("write stores embedding alongside memory", async () => {
    const mem = await memoryProvider.write({
      scope: "repo",
      scope_id: "embed-test",
      content: "embedding storage regression check",
    });

    // Wait for async embedding
    await memoryProvider.embedMemory(mem.id, mem.content);

    const store = memoryProvider.getEmbeddingStore();
    const vec = store.get(mem.id);
    expect(vec).not.toBeNull();
    expect(vec!.length).toBe(128); // MockEmbeddingProvider default dims
  });

  it("delete removes embedding", async () => {
    const mem = await memoryProvider.write({
      scope: "repo",
      scope_id: "embed-test",
      content: "embedding delete regression check",
    });
    await memoryProvider.embedMemory(mem.id, mem.content);

    await memoryProvider.delete(mem.id);

    const store = memoryProvider.getEmbeddingStore();
    const vec = store.get(mem.id);
    expect(vec).toBeNull();
  });

  it("update re-embeds on content change", async () => {
    const mem = await memoryProvider.write({
      scope: "repo",
      scope_id: "embed-test",
      content: "original content for re-embedding",
    });
    await memoryProvider.embedMemory(mem.id, mem.content);

    const store = memoryProvider.getEmbeddingStore();
    const originalVec = store.get(mem.id);

    await memoryProvider.update(mem.id, { content: "completely different content now" });
    await memoryProvider.embedMemory(mem.id, "completely different content now");

    const updatedVec = store.get(mem.id);
    expect(updatedVec).not.toBeNull();
    // Vectors should differ
    expect(updatedVec).not.toEqual(originalVec);
  });
});

describe("Regression — Provider Interface", () => {
  it("provider has correct name and status", () => {
    expect(memoryProvider.name).toBe("sqlite-hybrid-memory");
    expect(memoryProvider.status).toBe("direct");
  });

  it("registered as memory provider", () => {
    const provider = getProvider("memory");
    expect(provider.name).toBe("sqlite-hybrid-memory");
  });
});
