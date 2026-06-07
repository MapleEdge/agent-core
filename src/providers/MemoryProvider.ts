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
  kind: MemoryKind;
  facts: string[];
  concepts: string[];
  files_read: string[];
  files_modified: string[];
  created_at: string;
  updated_at: string;
}

export interface MemorySearchResult {
  id: string;
  content: string;
  scope: string;
  kind: MemoryKind;
  score: number;
  metadata: Record<string, unknown>;
  facts: string[];
  concepts: string[];
  files_read: string[];
  files_modified: string[];
}

export type MemoryKind = "observation" | "summary" | "prompt" | "manual";

export interface MemoryWriteParams {
  scope: string;
  scope_id: string;
  content: string;
  metadata?: Record<string, unknown>;
  kind?: MemoryKind;
  facts?: string[];
  concepts?: string[];
  files_read?: string[];
  files_modified?: string[];
}

export interface MemorySearchParams {
  query: string;
  scope?: string;
  scope_id?: string;
  filters?: Record<string, unknown>;
  top_k?: number;
  threshold?: number;
}

export interface MemoryUpdateParams {
  content?: string;
  metadata?: Record<string, unknown>;
  kind?: MemoryKind;
  facts?: string[];
  concepts?: string[];
  files_read?: string[];
  files_modified?: string[];
}

export interface MemoryProvider {
  readonly name: string;
  readonly status: import("./registry.js").ProviderStatus;

  write(params: MemoryWriteParams): Promise<MemoryRecord>;
  search(params: MemorySearchParams): Promise<MemorySearchResult[]>;
  get(id: string): Promise<MemoryRecord | null>;
  update(id: string, params: MemoryUpdateParams): Promise<MemoryRecord | null>;
  delete(id: string): Promise<boolean>;
}
