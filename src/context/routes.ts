import { FastifyInstance } from "fastify";
import { v4 as uuid } from "uuid";
import { getDb } from "../db.js";
import {
  ContextSearchInput,
  ContextLinkInput,
  ContextPromoteInput,
} from "../schemas/context.js";

const DEFAULT_TREE = {
  repo: {
    overview: { content: "", children: {} },
    commands: { content: "", children: {} },
    architecture: { content: "", children: {} },
    dependencies: { content: "", children: {} },
    tests: { content: "", children: {} },
    entrypoints: { content: "", children: {} },
    "known-failures": { content: "", children: {} },
    skills: { content: "", children: {} },
    sessions: { content: "", children: {} },
    "policy-notes": { content: "", children: {} },
  },
};

export async function contextRoutes(app: FastifyInstance): Promise<void> {
  app.post("/context/repos/:repo_id/onboard", async (req, reply) => {
    const { repo_id } = req.params as { repo_id: string };
    const db = getDb();
    const existing = db.prepare(`SELECT * FROM context_repos WHERE repo_id = ?`).get(repo_id);
    if (existing) {
      return { repo_id, status: "already_onboarded" };
    }
    db.prepare(`INSERT INTO context_repos (repo_id, tree) VALUES (?, ?)`).run(
      repo_id,
      JSON.stringify(DEFAULT_TREE),
    );
    reply.code(201);
    return { repo_id, status: "onboarded", tree: DEFAULT_TREE };
  });

  app.get("/context/repos/:repo_id/tree", async (req) => {
    const { repo_id } = req.params as { repo_id: string };
    const db = getDb();
    const row = db.prepare(`SELECT * FROM context_repos WHERE repo_id = ?`).get(repo_id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return { error: "repo not onboarded" };
    }
    return { repo_id, tree: JSON.parse(row.tree as string) };
  });

  app.post("/context/search", async (req) => {
    const input = ContextSearchInput.parse(req.body);
    const db = getDb();
    const row = db.prepare(`SELECT * FROM context_repos WHERE repo_id = ?`).get(input.repo_id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return { results: [] };
    }
    const tree = JSON.parse(row.tree as string);
    const results = searchTree(tree, input.query, input.path ?? "");
    return { results };
  });

  app.post("/context/link", async (req, reply) => {
    const input = ContextLinkInput.parse(req.body);
    const id = uuid();
    const db = getDb();
    db.prepare(
      `INSERT INTO context_links (id, source_repo, source_path, target_repo, target_path, relation)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, input.source_repo, input.source_path, input.target_repo, input.target_path, input.relation);
    reply.code(201);
    return { id, ...input };
  });

  app.post("/context/promote", async (req) => {
    const input = ContextPromoteInput.parse(req.body);
    const db = getDb();
    const row = db.prepare(`SELECT * FROM context_repos WHERE repo_id = ?`).get(input.repo_id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return { error: "repo not onboarded" };
    }
    const tree = JSON.parse(row.tree as string);
    setTreeNode(tree, input.path, input.content);
    db.prepare(`UPDATE context_repos SET tree = ? WHERE repo_id = ?`).run(
      JSON.stringify(tree),
      input.repo_id,
    );
    return { repo_id: input.repo_id, path: input.path, status: "promoted" };
  });
}

function searchTree(
  node: Record<string, unknown>,
  query: string,
  prefix: string,
): { path: string; content: string }[] {
  const results: { path: string; content: string }[] = [];
  const q = query.toLowerCase();
  for (const [key, value] of Object.entries(node)) {
    const currentPath = prefix ? `${prefix}/${key}` : key;
    if (typeof value === "object" && value !== null) {
      const v = value as Record<string, unknown>;
      if (typeof v.content === "string" && v.content.toLowerCase().includes(q)) {
        results.push({ path: currentPath, content: v.content });
      }
      if (v.children && typeof v.children === "object") {
        results.push(...searchTree(v.children as Record<string, unknown>, query, currentPath));
      }
      if (!("content" in v)) {
        results.push(...searchTree(v, query, currentPath));
      }
    }
    if (key.toLowerCase().includes(q)) {
      results.push({ path: currentPath, content: `[node: ${key}]` });
    }
  }
  return results;
}

function setTreeNode(tree: Record<string, unknown>, path: string, content: string): void {
  const parts = path.split("/").filter(Boolean);
  let current = tree;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== "object") {
      current[part] = { content: "", children: {} };
    }
    const node = current[part] as Record<string, unknown>;
    current = (node.children ?? node) as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  current[last] = { content, children: {} };
}
