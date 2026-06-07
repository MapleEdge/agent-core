/**
 * Memory mapping layer: agent-core <-> mem0
 *
 * Translates between agent-core MemoryRecord/MemorySearchResult shapes
 * and the mem0 REST API request/response formats.
 *
 * mem0 stores memories as:
 *   { id, memory, user_id, agent_id, run_id, hash, metadata, created_at, updated_at, score? }
 *
 * agent-core stores memories as:
 *   { id, scope, scope_id, content, metadata, kind, facts, concepts, files_read, files_modified, ... }
 */

import type {
  MemoryRecord,
  MemorySearchResult,
  MemoryWriteParams,
  MemorySearchParams,
  MemoryUpdateParams,
  MemoryKind,
} from "../../providers/MemoryProvider.js";

// ── mem0 response shapes ──────────────────────────────────────────────

export interface Mem0Memory {
  id: string;
  memory: string;
  user_id?: string;
  agent_id?: string;
  run_id?: string;
  hash?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  score?: number;
}

export interface Mem0AddResponse {
  results: Array<{
    id: string;
    memory: string;
    event: string;
  }>;
}

export interface Mem0SearchResponse {
  results: Mem0Memory[];
}

// ── Mapping helpers ───────────────────────────────────────────────────

/**
 * Map agent-core scope/scope_id to mem0 entity identifiers.
 *
 * Convention:
 *   scope="user"    -> user_id=scope_id
 *   scope="agent"   -> agent_id=scope_id
 *   scope="session" -> run_id=scope_id
 *   scope="repo"    -> user_id="repo:<scope_id>"  (prefix convention)
 *   other           -> user_id="<scope>:<scope_id>"
 */
export function scopeToMem0Filters(
  scope?: string,
  scopeId?: string,
): Record<string, string> {
  if (!scope || !scopeId) return { user_id: "default" };

  switch (scope) {
    case "user":
      return { user_id: scopeId };
    case "agent":
      return { agent_id: scopeId };
    case "session":
      return { run_id: scopeId };
    default:
      return { user_id: `${scope}:${scopeId}` };
  }
}

/**
 * Reverse-map mem0 entity identifiers back to agent-core scope/scope_id.
 */
export function mem0FiltersToScope(mem: Mem0Memory): { scope: string; scope_id: string } {
  if (mem.agent_id) return { scope: "agent", scope_id: mem.agent_id };
  if (mem.run_id) return { scope: "session", scope_id: mem.run_id };
  if (mem.user_id) {
    const uid = mem.user_id;
    const colonIdx = uid.indexOf(":");
    if (colonIdx > 0) {
      return { scope: uid.slice(0, colonIdx), scope_id: uid.slice(colonIdx + 1) };
    }
    return { scope: "user", scope_id: uid };
  }
  return { scope: "unknown", scope_id: "unknown" };
}

/** Extract agent-core metadata extensions from mem0 metadata blob. */
function extractAgentCoreFields(metadata: Record<string, unknown> | undefined): {
  kind: MemoryKind;
  facts: string[];
  concepts: string[];
  files_read: string[];
  files_modified: string[];
  cleanMeta: Record<string, unknown>;
} {
  const m = metadata ?? {};
  const kind = (typeof m._ac_kind === "string" ? m._ac_kind : "observation") as MemoryKind;
  const facts = Array.isArray(m._ac_facts) ? (m._ac_facts as string[]) : [];
  const concepts = Array.isArray(m._ac_concepts) ? (m._ac_concepts as string[]) : [];
  const files_read = Array.isArray(m._ac_files_read) ? (m._ac_files_read as string[]) : [];
  const files_modified = Array.isArray(m._ac_files_modified) ? (m._ac_files_modified as string[]) : [];

  // Strip agent-core prefixed fields from user-facing metadata
  const cleanMeta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m)) {
    if (!k.startsWith("_ac_")) {
      cleanMeta[k] = v;
    }
  }
  return { kind, facts, concepts, files_read, files_modified, cleanMeta };
}

/** Pack agent-core extensions into mem0 metadata for round-trip. */
export function packAgentCoreMetadata(
  params: MemoryWriteParams | MemoryUpdateParams,
  baseMeta?: Record<string, unknown>,
): Record<string, unknown> {
  const meta: Record<string, unknown> = { ...(baseMeta ?? {}), ...(params.metadata ?? {}) };
  if ("kind" in params && params.kind) meta._ac_kind = params.kind;
  if ("facts" in params && params.facts?.length) meta._ac_facts = params.facts;
  if ("concepts" in params && params.concepts?.length) meta._ac_concepts = params.concepts;
  if ("files_read" in params && params.files_read?.length) meta._ac_files_read = params.files_read;
  if ("files_modified" in params && params.files_modified?.length) meta._ac_files_modified = params.files_modified;
  return meta;
}

// ── Main mappers ──────────────────────────────────────────────────────

/** Convert mem0 memory response to agent-core MemoryRecord. */
export function mem0ToRecord(mem: Mem0Memory): MemoryRecord {
  const { scope, scope_id } = mem0FiltersToScope(mem);
  const { kind, facts, concepts, files_read, files_modified, cleanMeta } = extractAgentCoreFields(mem.metadata);

  return {
    id: mem.id,
    scope,
    scope_id,
    content: mem.memory,
    metadata: cleanMeta,
    kind,
    facts,
    concepts,
    files_read,
    files_modified,
    created_at: mem.created_at ?? new Date().toISOString(),
    updated_at: mem.updated_at ?? new Date().toISOString(),
  };
}

/** Convert mem0 search hit to agent-core MemorySearchResult. */
export function mem0ToSearchResult(mem: Mem0Memory): MemorySearchResult {
  const { scope } = mem0FiltersToScope(mem);
  const { kind, facts, concepts, files_read, files_modified, cleanMeta } = extractAgentCoreFields(mem.metadata);

  return {
    id: mem.id,
    content: mem.memory,
    scope,
    kind,
    score: mem.score ?? 0,
    metadata: cleanMeta,
    facts,
    concepts,
    files_read,
    files_modified,
    created_at: mem.created_at,
    updated_at: mem.updated_at,
  };
}

/** Build mem0 search request filters from agent-core MemorySearchParams. */
export function buildMem0SearchFilters(
  params: MemorySearchParams,
): Record<string, unknown> {
  const filters: Record<string, unknown> = {
    ...scopeToMem0Filters(params.scope, params.scope_id),
  };

  // Merge user-provided filters (metadata operators) on top
  if (params.filters) {
    for (const [k, v] of Object.entries(params.filters)) {
      // Don't override scope-derived entity IDs
      if (k !== "user_id" && k !== "agent_id" && k !== "run_id") {
        filters[k] = v;
      }
    }
  }

  return filters;
}
