import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { memoryRoutes } from "../src/memory/routes.js";
import { contextRoutes } from "../src/context/routes.js";
import { sessionRoutes, traceRoutes } from "../src/traces/routes.js";
import { actionRoutes } from "../src/actions/routes.js";
import { rulesRoutes, seedDefaultRules } from "../src/rules/routes.js";
import { classifyRoutes } from "../src/api/classify.js";
import { policyRoutes, seedDefaultPolicies } from "../src/api/policy.js";
import { mockPlatformRoutes } from "../src/mock_platform/routes.js";
import { seedDefaultActions } from "../src/actions/defaults.js";
import { closeDb } from "../src/db.js";
import { registerDefaultProviders } from "../src/providers/defaults.js";
import { resetProviderRegistry } from "../src/providers/registry.js";
import { providerRoutes } from "../src/providers/routes.js";

let app: FastifyInstance;

beforeAll(async () => {
  process.env.AGENT_CORE_DB = ":memory:";
  app = Fastify();
  await app.register(memoryRoutes);
  await app.register(contextRoutes);
  await app.register(sessionRoutes);
  await app.register(traceRoutes);
  await app.register(actionRoutes);
  await app.register(rulesRoutes);
  await app.register(classifyRoutes);
  await app.register(policyRoutes);
  await app.register(mockPlatformRoutes);
  await app.register(providerRoutes);
  seedDefaultActions();
  seedDefaultRules();
  seedDefaultPolicies();
  registerDefaultProviders();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  resetProviderRegistry();
  closeDb();
});

describe("Memory", () => {
  let memoryId: string;

  it("writes a memory", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/memory/write",
      payload: {
        scope: "repo",
        scope_id: "demo",
        content: "Run tests before committing",
        kind: "observation",
        facts: ["Tests are required before commit"],
        concepts: ["testing"],
        files_read: ["README.md"],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.scope).toBe("repo");
    memoryId = body.id;
  });

  it("searches memories", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/memory/search",
      payload: { query: "testing", scope: "repo" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0].concepts).toContain("testing");
  });

  it("gets a memory by ID", async () => {
    const res = await app.inject({ method: "GET", url: `/memory/${memoryId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().content).toBe("Run tests before committing");
    expect(res.json().kind).toBe("observation");
    expect(res.json().facts).toContain("Tests are required before commit");
  });

  it("patches a memory", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/memory/${memoryId}`,
      payload: { content: "Always run tests", concepts: ["testing", "quality"] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().concepts).toEqual(["testing", "quality"]);
  });

  it("extracts candidates", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/memory/extract",
      payload: { session_id: "s1", text: "You should always run lint. Never skip tests." },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().candidates.length).toBeGreaterThan(0);
  });

  it("promotes a memory", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/memory/promote",
      payload: { memory_id: memoryId, target_scope: "global_policy" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().promoted_from).toBe(memoryId);
  });

  it("deletes a memory", async () => {
    const res = await app.inject({ method: "DELETE", url: `/memory/${memoryId}` });
    expect(res.statusCode).toBe(204);
  });
});

describe("Context", () => {
  it("onboards a repo", async () => {
    const res = await app.inject({ method: "POST", url: "/context/repos/test-repo/onboard" });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("onboarded");
  });

  it("gets the context tree", async () => {
    const res = await app.inject({ method: "GET", url: "/context/repos/test-repo/tree" });
    expect(res.statusCode).toBe(200);
    expect(res.json().tree).toBeDefined();
  });

  it("searches context", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/context/search",
      payload: { repo_id: "test-repo", query: "tests" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().results).toBeDefined();
  });

  it("links context nodes", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/context/link",
      payload: {
        source_repo: "test-repo",
        source_path: "repo/tests",
        target_repo: "other-repo",
        target_path: "repo/tests",
        relation: "mirrors",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBeDefined();
  });

  it("promotes context content", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/context/promote",
      payload: { repo_id: "test-repo", path: "repo/overview", content: "A test repo" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("promoted");
  });
});

describe("Sessions and traces", () => {
  let sessionId: string;

  it("creates a session", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { repo_id: "demo" },
    });
    expect(res.statusCode).toBe(201);
    sessionId = res.json().id;
    expect(sessionId).toBeDefined();
  });

  it("gets a session", async () => {
    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("active");
  });

  it("records a session event", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/events`,
      payload: { event_type: "prompt", data: { text: "Fix the login test" } },
    });
    expect(res.statusCode).toBe(201);
  });

  it("records a tool-call trace", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/traces/tool-call",
      payload: {
        session_id: sessionId,
        action_name: "read_file",
        input: { path: "src/auth.ts" },
        output: { content: "..." },
        duration_ms: 42,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().trace_type).toBe("tool-call");
  });

  it("records a skill-run trace", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/traces/skill-run",
      payload: {
        session_id: sessionId,
        skill_name: "lint-fix",
        input: {},
        output: { fixed: 3 },
        duration_ms: 200,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().trace_type).toBe("skill-run");
  });

  it("gets session timeline", async () => {
    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}/timeline` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.events.length).toBeGreaterThan(0);
    expect(body.traces.length).toBeGreaterThan(0);
  });

  it("gets traces by session", async () => {
    const res = await app.inject({ method: "GET", url: `/traces/session/${sessionId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().traces.length).toBeGreaterThan(0);
  });
});

describe("Actions", () => {
  it("lists default actions", async () => {
    const res = await app.inject({ method: "GET", url: "/actions" });
    expect(res.statusCode).toBe(200);
    expect(res.json().actions.length).toBeGreaterThanOrEqual(10);
  });

  it("gets a specific action", async () => {
    const res = await app.inject({ method: "GET", url: "/actions/read_file" });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("read_file");
  });

  it("registers a custom action", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/register",
      payload: { name: "custom_action", description: "A custom test action", risk_level: "medium" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("registered");
  });

  it("validates an action", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/validate",
      payload: { action_name: "read_file", params: { path: "src/index.ts" } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().valid).toBe(true);
  });

  it("executes a mock action", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/execute",
      payload: { action_name: "run_tests", params: {} },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().executed).toBe(true);
  });

  it("blocks approval-required actions", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/actions/execute",
      payload: { action_name: "commit", params: {} },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().executed).toBe(false);
    expect(res.json().approval_required).toBe(true);
  });
});

describe("Rules", () => {
  it("gets allowed next actions", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/rules/allowed-next-actions",
      payload: { task_type: "code_edit", current_action: "classify_task" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().allowed).toContain("read_file");
  });

  it("validates a sequence", async () => {
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

describe("Classifier", () => {
  it("classifies a do-task", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/classify/task",
      payload: { prompt: "Fix a failing login test" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.intent).toBe("do");
    expect(body.task_type).toBe("test_fix");
    expect(body.suggested_sequence.length).toBeGreaterThan(0);
  });

  it("classifies an ask-task", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/classify/task",
      payload: { prompt: "What does the auth module do?" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().intent).toBe("ask");
  });
});

describe("Policy", () => {
  it("allows safe actions", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/mock-platform/policy/check",
      payload: { session_id: "s1", action_name: "read_file" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().allowed).toBe(true);
  });

  it("blocks dangerous actions", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/mock-platform/policy/check",
      payload: { session_id: "s1", action_name: "deploy" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().allowed).toBe(false);
    expect(res.json().requires_approval).toBe(true);
  });
});

describe("Providers", () => {
  it("exposes a capability matrix for all provider slots", async () => {
    const res = await app.inject({ method: "GET", url: "/providers/capabilities" });
    expect(res.statusCode).toBe(200);
    const capabilities = res.json().capabilities;
    expect(capabilities.map((cap: { name: string }) => cap.name)).toEqual(
      expect.arrayContaining([
        "memory",
        "session",
        "context",
        "action",
        "ruleSolver",
        "trace",
        "classifier",
        "policyMatcher",
      ]),
    );
    expect(capabilities.find((cap: { name: string }) => cap.name === "ruleSolver")).toMatchObject({
      provider: "letta-rule-solver",
      status: "direct",
    });
  });
});

describe("Mock platform", () => {
  it("opens a repo", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/mock-platform/repos/open",
      payload: { repo_url: "https://github.com/org/repo", branch: "main" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("opened");
  });

  it("creates a worktree", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/mock-platform/worktrees/create",
      payload: { repo_id: "repo-abc", branch: "fix/login" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("created");
  });

  it("selects an executor", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/mock-platform/executors/select",
      payload: { task_type: "code_edit", complexity_score: 80 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().executor).toBe("openhands");
  });

  it("mocks a commit", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/mock-platform/commits/mock",
      payload: { session_id: "s1", repo_id: "demo", message: "fix tests", files: ["src/auth.ts"] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("mock_committed");
  });
});
