import { v4 as uuidv4 } from "uuid";
import { getDb } from "../../db.js";
import type {
  ContextProvider,
  ContextNode,
  ContextSearchResult,
  ContextLink,
} from "../ContextProvider.js";
import type { ProviderStatus } from "../registry.js";

const DEFAULT_TREE: ContextNode = {
  path: "repo",
  label: "repo",
  children: [
    "overview",
    "commands",
    "architecture",
    "dependencies",
    "tests",
    "entrypoints",
    "known-failures",
    "skills",
    "sessions",
    "policy-notes",
  ].map((path) => ({ path: `repo/${path}`, label: path, content: "", children: [] })),
};

interface ContextRepoRow {
  repo_id: string;
  tree: string;
}

interface ContextLinkRow {
  id: string;
  source_repo: string;
  source_path: string;
  target_repo: string;
  target_path: string;
  relation: string;
}

export class MockContextProvider implements ContextProvider {
  readonly name = "mock-context";
  readonly status: ProviderStatus = "mock";

  async onboard(repo_id: string): Promise<ContextNode> {
    const db = getDb();
    const existing = db.prepare("SELECT * FROM context_repos WHERE repo_id = ?").get(repo_id) as ContextRepoRow | undefined;
    if (existing) return this.parseTree(existing.tree);
    db.prepare("INSERT INTO context_repos (repo_id, tree) VALUES (?, ?)").run(
      repo_id,
      JSON.stringify(DEFAULT_TREE),
    );
    return DEFAULT_TREE;
  }

  async getTree(repo_id: string): Promise<ContextNode | null> {
    const row = getDb().prepare("SELECT * FROM context_repos WHERE repo_id = ?").get(repo_id) as ContextRepoRow | undefined;
    return row ? this.parseTree(row.tree) : null;
  }

  async search(query: string, repo_id?: string): Promise<ContextSearchResult[]> {
    const db = getDb();
    const rows = repo_id
      ? db.prepare("SELECT * FROM context_repos WHERE repo_id = ?").all(repo_id)
      : db.prepare("SELECT * FROM context_repos").all();
    const normalizedQuery = query.toLowerCase();
    const results: ContextSearchResult[] = [];
    for (const row of rows as ContextRepoRow[]) {
      this.searchNode(this.parseTree(row.tree), normalizedQuery, results);
    }
    return results;
  }

  async link(
    source_repo: string,
    source_path: string,
    target_repo: string,
    target_path: string,
    relation = "related",
  ): Promise<ContextLink> {
    const id = uuidv4();
    const db = getDb();
    db.prepare(
      "INSERT INTO context_links (id, source_repo, source_path, target_repo, target_path, relation) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(id, source_repo, source_path, target_repo, target_path, relation);
    const row = db.prepare("SELECT * FROM context_links WHERE id = ?").get(id) as ContextLinkRow | undefined;
    if (!row) throw new Error(`Failed to create context link "${id}"`);
    return row;
  }

  async promote(repo_id: string, path: string, content: string): Promise<ContextNode | null> {
    const tree = await this.getTree(repo_id);
    if (!tree) return null;
    const promoted = this.setNodeContent(tree, path, content);
    getDb().prepare("UPDATE context_repos SET tree = ? WHERE repo_id = ?").run(JSON.stringify(tree), repo_id);
    return promoted;
  }

  private parseTree(value: string): ContextNode {
    return JSON.parse(value) as ContextNode;
  }

  private searchNode(
    node: ContextNode,
    normalizedQuery: string,
    results: ContextSearchResult[],
  ): void {
    const content = node.content ?? "";
    const labelMatch = node.label.toLowerCase().includes(normalizedQuery);
    const contentMatch = content.toLowerCase().includes(normalizedQuery);
    if (labelMatch || contentMatch) {
      results.push({
        path: node.path,
        label: node.label,
        score: contentMatch ? 1 : 0.6,
        content: contentMatch ? content : `[node: ${node.label}]`,
      });
    }
    for (const child of node.children ?? []) this.searchNode(child, normalizedQuery, results);
  }

  private setNodeContent(node: ContextNode, path: string, content: string): ContextNode {
    if (node.path === path) {
      node.content = content;
      return node;
    }

    const children = node.children ?? [];
    const existing = children.find((child) => path === child.path || path.startsWith(`${child.path}/`));
    if (existing) return this.setNodeContent(existing, path, content);

    const child: ContextNode = {
      path,
      label: path.split("/").at(-1) ?? path,
      content,
      children: [],
    };
    node.children = [...children, child];
    return child;
  }
}
