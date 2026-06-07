/**
 * ContextProvider interface.
 *
 * Expected implementations:
 *   - MockContextProvider (built-in, static tree)
 *   - OpenViking-inspired adapter (Phase 3, reference only for now)
 *
 * Reference: OpenViking VikingFS, HierarchicalRetriever
 */

export interface ContextNode {
  path: string;
  label: string;
  children?: ContextNode[];
  content?: string;
}

export interface ContextSearchResult {
  path: string;
  label: string;
  score: number;
  content?: string;
}

export interface ContextLink {
  id: string;
  source_repo: string;
  source_path: string;
  target_repo: string;
  target_path: string;
  relation: string;
}

export interface ContextProvider {
  readonly name: string;
  readonly status: import("./registry.js").ProviderStatus;

  onboard(repo_id: string): Promise<ContextNode>;
  getTree(repo_id: string): Promise<ContextNode | null>;
  search(query: string, repo_id?: string): Promise<ContextSearchResult[]>;
  link(source_repo: string, source_path: string, target_repo: string, target_path: string, relation?: string): Promise<ContextLink>;
  promote(repo_id: string, path: string, content: string): Promise<ContextNode | null>;
}
