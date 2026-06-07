/**
 * Mem0MemoryProvider — adapter that delegates to a mem0 REST API.
 *
 * Integration status: "adapter" — calls a real external API (mem0 server)
 * with graceful error handling.
 *
 * Environment:
 *   MEM0_BASE_URL   — mem0 server URL (default: http://localhost:8000)
 *   MEM0_API_KEY    — optional API key for authenticated access
 *   MEM0_USER_ID    — default user_id for scoping (default: "agent-core")
 *
 * The provider maps agent-core's MemoryProvider contract to mem0's REST API,
 * preserving agent-core metadata extensions via the _ac_ prefix convention.
 */

import type {
  MemoryProvider,
  MemoryRecord,
  MemorySearchResult,
  MemoryWriteParams,
  MemorySearchParams,
  MemoryUpdateParams,
} from "../MemoryProvider.js";
import type { ProviderStatus } from "../registry.js";
import {
  scopeToMem0Filters,
  packAgentCoreMetadata,
  mem0ToRecord,
  mem0ToSearchResult,
  buildMem0SearchFilters,
  type Mem0Memory,
  type Mem0AddResponse,
  type Mem0SearchResponse,
} from "../../memory/mappers/mem0Mapper.js";

export interface Mem0Config {
  baseUrl: string;
  apiKey?: string;
  defaultUserId: string;
}

export function getMem0Config(): Mem0Config | null {
  const baseUrl = process.env.MEM0_BASE_URL;
  if (!baseUrl) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey: process.env.MEM0_API_KEY,
    defaultUserId: process.env.MEM0_USER_ID ?? "agent-core",
  };
}

export class Mem0MemoryProvider implements MemoryProvider {
  readonly name = "mem0-memory";
  readonly status: ProviderStatus = "adapter";

  private readonly config: Mem0Config;

  constructor(config: Mem0Config) {
    this.config = config;
  }

  // ── HTTP helpers ──────────────────────────────────────────────────

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) {
      h["Authorization"] = `Bearer ${this.config.apiKey}`;
    }
    return h;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: this.headers(),
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const res = await fetch(url, init);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`mem0 ${method} ${path} failed (${res.status}): ${text}`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await res.json()) as T;
    }
    return {} as T;
  }

  // ── MemoryProvider contract ───────────────────────────────────────

  async write(params: MemoryWriteParams): Promise<MemoryRecord> {
    const entityFilters = scopeToMem0Filters(params.scope, params.scope_id);
    const metadata = packAgentCoreMetadata(params);

    const body = {
      messages: [{ role: "user", content: params.content }],
      ...entityFilters,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      infer: true,
    };

    const response = await this.request<Mem0AddResponse>("POST", "/memories", body);

    // mem0 may return multiple extracted memories; take the first or use
    // the raw content if extraction returned nothing
    const firstResult = response.results?.[0];

    const now = new Date().toISOString();
    const record: MemoryRecord = {
      id: firstResult?.id ?? `mem0-${Date.now()}`,
      scope: params.scope,
      scope_id: params.scope_id,
      content: firstResult?.memory ?? params.content,
      metadata: params.metadata ?? {},
      kind: params.kind ?? "observation",
      facts: params.facts ?? [],
      concepts: params.concepts ?? [],
      files_read: params.files_read ?? [],
      files_modified: params.files_modified ?? [],
      created_at: now,
      updated_at: now,
    };

    return record;
  }

  async search(params: MemorySearchParams): Promise<MemorySearchResult[]> {
    const filters = buildMem0SearchFilters(params);
    const body: Record<string, unknown> = {
      query: params.query,
      filters,
    };
    if (params.top_k) body.top_k = params.top_k;
    if (params.threshold) body.threshold = params.threshold;

    const response = await this.request<Mem0SearchResponse>("POST", "/search", body);
    return (response.results ?? []).map(mem0ToSearchResult);
  }

  async get(id: string): Promise<MemoryRecord | null> {
    try {
      const mem = await this.request<Mem0Memory>("GET", `/memories/${id}`);
      if (!mem?.id || !mem?.memory) return null;
      return mem0ToRecord(mem);
    } catch {
      return null;
    }
  }

  async update(id: string, params: MemoryUpdateParams): Promise<MemoryRecord | null> {
    try {
      const body: Record<string, unknown> = {};
      if (params.content) body.text = params.content;

      const metadata = packAgentCoreMetadata(params);
      if (Object.keys(metadata).length > 0) body.metadata = metadata;

      await this.request<{ message: string }>("PUT", `/memories/${id}`, body);

      // Re-fetch to get updated record
      return this.get(id);
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.request<{ message: string }>("DELETE", `/memories/${id}`);
      return true;
    } catch {
      return false;
    }
  }
}
