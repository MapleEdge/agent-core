/**
 * MemoryProvider interface.
 *
 * Expected implementations:
 *   - MockMemoryProvider (built-in, SQLite LIKE search)
 *   - Mem0MemoryAdapter (Phase 2, Python sidecar over HTTP)
 *
 * Reference: mem0 Memory.add/search/get/update/delete
 */

export interface MemoryRecord {
  id: string;
  scope: string;
  scope_id: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MemorySearchResult {
  id: string;
  content: string;
  scope: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface MemoryWriteParams {
  scope: string;
  scope_id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface MemorySearchParams {
  query: string;
  scope?: string;
  scope_id?: string;
  top_k?: number;
  threshold?: number;
}

export interface MemoryProvider {
  readonly name: string;
  readonly status: import("./registry.js").ProviderStatus;

  write(params: MemoryWriteParams): Promise<MemoryRecord>;
  search(params: MemorySearchParams): Promise<MemorySearchResult[]>;
  get(id: string): Promise<MemoryRecord | null>;
  update(id: string, content: string, metadata?: Record<string, unknown>): Promise<MemoryRecord | null>;
  delete(id: string): Promise<boolean>;
}
