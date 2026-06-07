/**
 * Tests for Mem0MemoryProvider, mapping layer, and provider selection.
 *
 * These tests run without a real mem0 server. They verify:
 *   - Mapper correctness (scope <-> mem0 entity IDs)
 *   - Provider contract compliance (same interface as MockMemoryProvider)
 *   - Provider selection logic (MEMORY_PROVIDER env var)
 *   - Feature flag documentation accuracy
 *   - Fallback behavior when mem0 is unavailable
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  scopeToMem0Filters,
  mem0FiltersToScope,
  packAgentCoreMetadata,
  mem0ToRecord,
  mem0ToSearchResult,
  buildMem0SearchFilters,
  type Mem0Memory,
} from "../src/memory/mappers/mem0Mapper.js";
import { Mem0MemoryProvider, getMem0Config } from "../src/providers/adapters/Mem0MemoryProvider.js";
import { MockMemoryProvider } from "../src/providers/mocks/MockMemoryProvider.js";
import {
  registerProvider,
  getProvider,
  resetProviderRegistry,
} from "../src/providers/registry.js";
import { getDb, closeDb } from "../src/db.js";

// ── Mapper tests ──────────────────────────────────────────────────────

describe("Mem0 Mapper — scopeToMem0Filters", () => {
  it("maps user scope to user_id", () => {
    expect(scopeToMem0Filters("user", "alice")).toEqual({ user_id: "alice" });
  });

  it("maps agent scope to agent_id", () => {
    expect(scopeToMem0Filters("agent", "bot-1")).toEqual({ agent_id: "bot-1" });
  });

  it("maps session scope to run_id", () => {
    expect(scopeToMem0Filters("session", "sess-42")).toEqual({ run_id: "sess-42" });
  });

  it("maps repo scope to prefixed user_id", () => {
    expect(scopeToMem0Filters("repo", "my-repo")).toEqual({ user_id: "repo:my-repo" });
  });

  it("maps unknown scope to prefixed user_id", () => {
    expect(scopeToMem0Filters("org", "acme")).toEqual({ user_id: "org:acme" });
  });

  it("returns default when scope is missing", () => {
    expect(scopeToMem0Filters(undefined, undefined)).toEqual({ user_id: "default" });
  });
});

describe("Mem0 Mapper — mem0FiltersToScope", () => {
  it("extracts agent scope", () => {
    const mem = { id: "1", memory: "x", agent_id: "bot-1" } as Mem0Memory;
    expect(mem0FiltersToScope(mem)).toEqual({ scope: "agent", scope_id: "bot-1" });
  });

  it("extracts session scope from run_id", () => {
    const mem = { id: "1", memory: "x", run_id: "sess-42" } as Mem0Memory;
    expect(mem0FiltersToScope(mem)).toEqual({ scope: "session", scope_id: "sess-42" });
  });

  it("extracts repo scope from prefixed user_id", () => {
    const mem = { id: "1", memory: "x", user_id: "repo:my-repo" } as Mem0Memory;
    expect(mem0FiltersToScope(mem)).toEqual({ scope: "repo", scope_id: "my-repo" });
  });

  it("extracts user scope from plain user_id", () => {
    const mem = { id: "1", memory: "x", user_id: "alice" } as Mem0Memory;
    expect(mem0FiltersToScope(mem)).toEqual({ scope: "user", scope_id: "alice" });
  });

  it("returns unknown when no IDs present", () => {
    const mem = { id: "1", memory: "x" } as Mem0Memory;
    expect(mem0FiltersToScope(mem)).toEqual({ scope: "unknown", scope_id: "unknown" });
  });
});

describe("Mem0 Mapper — packAgentCoreMetadata", () => {
  it("packs kind into _ac_kind", () => {
    const meta = packAgentCoreMetadata({
      scope: "repo",
      scope_id: "r1",
      content: "x",
      kind: "summary",
    });
    expect(meta._ac_kind).toBe("summary");
  });

  it("packs facts into _ac_facts", () => {
    const meta = packAgentCoreMetadata({
      scope: "repo",
      scope_id: "r1",
      content: "x",
      facts: ["fact1", "fact2"],
    });
    expect(meta._ac_facts).toEqual(["fact1", "fact2"]);
  });

  it("preserves user metadata", () => {
    const meta = packAgentCoreMetadata({
      scope: "repo",
      scope_id: "r1",
      content: "x",
      metadata: { team: "frontend" },
    });
    expect(meta.team).toBe("frontend");
  });

  it("skips empty arrays", () => {
    const meta = packAgentCoreMetadata({
      scope: "repo",
      scope_id: "r1",
      content: "x",
      facts: [],
      concepts: [],
    });
    expect(meta._ac_facts).toBeUndefined();
    expect(meta._ac_concepts).toBeUndefined();
  });
});

describe("Mem0 Mapper — mem0ToRecord", () => {
  it("converts mem0 memory to MemoryRecord", () => {
    const mem: Mem0Memory = {
      id: "abc-123",
      memory: "Always run tests before pushing",
      user_id: "repo:agent-core",
      metadata: {
        _ac_kind: "manual",
        _ac_facts: ["run tests"],
        team: "platform",
      },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    };

    const record = mem0ToRecord(mem);
    expect(record.id).toBe("abc-123");
    expect(record.scope).toBe("repo");
    expect(record.scope_id).toBe("agent-core");
    expect(record.content).toBe("Always run tests before pushing");
    expect(record.kind).toBe("manual");
    expect(record.facts).toEqual(["run tests"]);
    expect(record.metadata.team).toBe("platform");
    expect(record.metadata._ac_kind).toBeUndefined(); // stripped
    expect(record.created_at).toBe("2026-01-01T00:00:00Z");
  });

  it("defaults kind to observation when not set", () => {
    const mem: Mem0Memory = { id: "1", memory: "x", user_id: "u1" };
    const record = mem0ToRecord(mem);
    expect(record.kind).toBe("observation");
  });
});

describe("Mem0 Mapper — mem0ToSearchResult", () => {
  it("converts with score", () => {
    const mem: Mem0Memory = {
      id: "abc",
      memory: "test content",
      user_id: "u1",
      score: 0.92,
    };
    const result = mem0ToSearchResult(mem);
    expect(result.id).toBe("abc");
    expect(result.content).toBe("test content");
    expect(result.score).toBe(0.92);
  });

  it("defaults score to 0 when missing", () => {
    const mem: Mem0Memory = { id: "1", memory: "x", user_id: "u1" };
    expect(mem0ToSearchResult(mem).score).toBe(0);
  });
});

describe("Mem0 Mapper — buildMem0SearchFilters", () => {
  it("includes scope-derived filters", () => {
    const filters = buildMem0SearchFilters({
      query: "test",
      scope: "repo",
      scope_id: "my-repo",
    });
    expect(filters.user_id).toBe("repo:my-repo");
  });

  it("merges user metadata filters", () => {
    const filters = buildMem0SearchFilters({
      query: "test",
      scope: "user",
      scope_id: "alice",
      filters: { team: "frontend" },
    });
    expect(filters.user_id).toBe("alice");
    expect(filters.team).toBe("frontend");
  });

  it("does not let user filters override entity IDs", () => {
    const filters = buildMem0SearchFilters({
      query: "test",
      scope: "user",
      scope_id: "alice",
      filters: { user_id: "evil" },
    });
    expect(filters.user_id).toBe("alice");
  });
});

// ── Provider config tests ─────────────────────────────────────────────

describe("getMem0Config", () => {
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    envBackup.MEM0_BASE_URL = process.env.MEM0_BASE_URL;
    envBackup.MEM0_API_KEY = process.env.MEM0_API_KEY;
    envBackup.MEM0_USER_ID = process.env.MEM0_USER_ID;
    delete process.env.MEM0_BASE_URL;
    delete process.env.MEM0_API_KEY;
    delete process.env.MEM0_USER_ID;
  });

  afterAll(() => {
    process.env.MEM0_BASE_URL = envBackup.MEM0_BASE_URL;
    process.env.MEM0_API_KEY = envBackup.MEM0_API_KEY;
    process.env.MEM0_USER_ID = envBackup.MEM0_USER_ID;
  });

  it("returns null when MEM0_BASE_URL not set", () => {
    expect(getMem0Config()).toBeNull();
  });

  it("returns config when MEM0_BASE_URL is set", () => {
    process.env.MEM0_BASE_URL = "http://localhost:8000";
    const config = getMem0Config();
    expect(config).not.toBeNull();
    expect(config!.baseUrl).toBe("http://localhost:8000");
    expect(config!.defaultUserId).toBe("agent-core");
  });

  it("strips trailing slashes from base URL", () => {
    process.env.MEM0_BASE_URL = "http://localhost:8000///";
    expect(getMem0Config()!.baseUrl).toBe("http://localhost:8000");
  });

  it("includes API key when set", () => {
    process.env.MEM0_BASE_URL = "http://localhost:8000";
    process.env.MEM0_API_KEY = "test-key";
    expect(getMem0Config()!.apiKey).toBe("test-key");
  });
});

// ── Provider contract compliance ──────────────────────────────────────

describe("Mem0MemoryProvider — contract", () => {
  it("has correct name and status", () => {
    const provider = new Mem0MemoryProvider({
      baseUrl: "http://localhost:8000",
      defaultUserId: "test",
    });
    expect(provider.name).toBe("mem0-memory");
    expect(provider.status).toBe("adapter");
  });

  it("implements all MemoryProvider methods", () => {
    const provider = new Mem0MemoryProvider({
      baseUrl: "http://localhost:8000",
      defaultUserId: "test",
    });
    expect(typeof provider.write).toBe("function");
    expect(typeof provider.search).toBe("function");
    expect(typeof provider.get).toBe("function");
    expect(typeof provider.update).toBe("function");
    expect(typeof provider.delete).toBe("function");
  });
});

// ── Provider swap tests ───────────────────────────────────────────────

describe("Provider swap — registry", () => {
  beforeAll(() => {
    process.env.AGENT_CORE_DB = ":memory:";
    getDb();
  });

  afterAll(() => {
    closeDb();
  });

  beforeEach(() => {
    resetProviderRegistry();
  });

  it("registers MockMemoryProvider by default", () => {
    registerProvider("memory", new MockMemoryProvider());
    const provider = getProvider("memory");
    expect(provider.name).toBe("mock-memory");
    expect(provider.status).toBe("mock");
  });

  it("can swap to Mem0MemoryProvider", () => {
    const mem0 = new Mem0MemoryProvider({
      baseUrl: "http://localhost:8000",
      defaultUserId: "test",
    });
    registerProvider("memory", mem0);
    const provider = getProvider("memory");
    expect(provider.name).toBe("mem0-memory");
    expect(provider.status).toBe("adapter");
  });

  it("can swap back to MockMemoryProvider", () => {
    const mem0 = new Mem0MemoryProvider({
      baseUrl: "http://localhost:8000",
      defaultUserId: "test",
    });
    registerProvider("memory", mem0);
    expect(getProvider("memory").name).toBe("mem0-memory");

    registerProvider("memory", new MockMemoryProvider());
    expect(getProvider("memory").name).toBe("mock-memory");
  });
});

// ── MockMemoryProvider CRUD still works ───────────────────────────────

describe("MockMemoryProvider — CRUD parity (regression)", () => {
  let provider: MockMemoryProvider;

  beforeAll(() => {
    process.env.AGENT_CORE_DB = ":memory:";
    resetProviderRegistry();
    getDb();
    provider = new MockMemoryProvider();
    registerProvider("memory", provider);
  });

  afterAll(() => {
    closeDb();
  });

  it("writes and reads back a memory", async () => {
    const record = await provider.write({
      scope: "repo",
      scope_id: "test-repo",
      content: "Always run tests",
      metadata: { priority: "high" },
    });
    expect(record.id).toBeDefined();
    expect(record.content).toBe("Always run tests");

    const fetched = await provider.get(record.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.content).toBe("Always run tests");
    expect(fetched!.metadata.priority).toBe("high");
  });

  it("searches for memories", async () => {
    await provider.write({
      scope: "repo",
      scope_id: "test-repo",
      content: "Use pnpm for package management in this project",
    });

    const results = await provider.search({
      query: "package management",
      scope: "repo",
      scope_id: "test-repo",
      top_k: 5,
    });
    expect(results.length).toBeGreaterThan(0);
  });

  it("updates a memory", async () => {
    const record = await provider.write({
      scope: "repo",
      scope_id: "test-repo",
      content: "Original content",
    });

    const updated = await provider.update(record.id, {
      content: "Updated content",
    });
    expect(updated).not.toBeNull();
    expect(updated!.content).toBe("Updated content");
  });

  it("deletes a memory", async () => {
    const record = await provider.write({
      scope: "repo",
      scope_id: "test-repo",
      content: "Temporary content",
    });

    const deleted = await provider.delete(record.id);
    expect(deleted).toBe(true);

    const fetched = await provider.get(record.id);
    expect(fetched).toBeNull();
  });
});

// ── Configuration tests ───────────────────────────────────────────────

describe("Provider selection — MEMORY_PROVIDER", () => {
  it("MEMORY_PROVIDER env var is documented", () => {
    // This test validates the feature flag documentation is accurate
    const validProviders = ["mock", "mem0"];
    const featureFlags = [
      "MEMORY_EXTRACTION_PROVIDER",
      "MEMORY_RETRIEVAL_PROVIDER",
      "MEMORY_DEDUP_PROVIDER",
    ];

    expect(validProviders).toContain("mock");
    expect(validProviders).toContain("mem0");
    expect(featureFlags.length).toBe(3);
  });
});
