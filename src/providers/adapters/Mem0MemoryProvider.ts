/**
 * Mem0MemoryProvider — adapter that delegates to mem0 via pluggable transport.
 *
 * Integration status: "adapter"
 *
 * Transport modes (selected via MEM0_TRANSPORT env var):
 *
 *   "embedded" (default) — spawns vendor/mem0/worker.py as a child process,
 *     communicates via JSON-RPC over stdin/stdout. No network, no ports, no auth.
 *     agent-core owns the Python process lifecycle.
 *
 *   "rest" — calls an external mem0 REST API over HTTP. Use when a centralized
 *     mem0 server is shared across multiple agent-core instances, or when Python
 *     is not available on the host.
 *
 * Why mem0 cannot run in-process:
 *   mem0 is a Python-only library. Its core dependencies (qdrant-client/grpc,
 *   pydantic, openai, sqlalchemy, protobuf) are native Python packages with
 *   C extensions. They cannot:
 *     - Be imported into a Node.js/TypeScript process
 *     - Run in WebAssembly (Pyodide) due to C extension requirements
 *     - Be trivially ported to TypeScript (200K+ LoC across dependencies)
 *
 *   The embedded worker transport is the closest achievable approximation to
 *   in-process execution: same machine, same lifecycle, no network.
 *
 * Environment:
 *   MEM0_TRANSPORT     — "embedded" (default) or "rest"
 *   MEM0_BASE_URL      — mem0 server URL (required for REST transport)
 *   MEM0_API_KEY       — optional API key for REST transport auth
 *   MEM0_PYTHON_PATH   — Python executable (default: "python3")
 *   MEM0_USER_ID       — default user_id for scoping (default: "agent-core")
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
import type { Mem0Transport } from "../../memory/transports/Mem0Transport.js";
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

export interface Mem0ProviderConfig {
  transport: Mem0Transport;
  defaultUserId: string;
}

/**
 * Resolve transport configuration from environment.
 *
 * Priority:
 *   1. MEM0_TRANSPORT=embedded → spawn Python worker (default)
 *   2. MEM0_TRANSPORT=rest → call MEM0_BASE_URL
 *   3. MEM0_BASE_URL set without MEM0_TRANSPORT → REST (backward compat)
 */
export async function createMem0Transport(): Promise<Mem0Transport | null> {
  const transport = process.env.MEM0_TRANSPORT ?? (process.env.MEM0_BASE_URL ? "rest" : "embedded");

  if (transport === "rest") {
    const baseUrl = process.env.MEM0_BASE_URL;
    if (!baseUrl) return null;

    const { Mem0RestTransport } = await import("../../memory/transports/Mem0RestTransport.js");
    return new Mem0RestTransport({
      baseUrl,
      apiKey: process.env.MEM0_API_KEY,
    });
  }

  // Default: embedded worker
  const { Mem0EmbeddedTransport } = await import("../../memory/transports/Mem0EmbeddedTransport.js");
  const embedded = new Mem0EmbeddedTransport({
    pythonPath: process.env.MEM0_PYTHON_PATH,
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        ([k]) => k.startsWith("MEM0_") || k.startsWith("OPENAI_"),
      ) as [string, string][],
    ),
  });

  return embedded;
}

/** Backward-compatible config reader for REST-only mode. */
export function getMem0Config(): { baseUrl: string; apiKey?: string; defaultUserId: string } | null {
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

  private readonly transport: Mem0Transport;

  constructor(config: Mem0ProviderConfig);
  constructor(transport: Mem0Transport);
  constructor(configOrTransport: Mem0ProviderConfig | Mem0Transport) {
    if ("call" in configOrTransport) {
      this.transport = configOrTransport;
    } else {
      this.transport = configOrTransport.transport;
    }
  }

  /** Which transport mode is active. */
  get transportMode(): "embedded" | "rest" {
    return this.transport.mode;
  }

  /** Expose transport for direct mem0 passthrough operations (ingest, recall). */
  getTransport(): Mem0Transport {
    return this.transport;
  }

  // ── MemoryProvider contract ───────────────────────────────────────

  async write(params: MemoryWriteParams): Promise<MemoryRecord> {
    const entityFilters = scopeToMem0Filters(params.scope, params.scope_id);
    const metadata = packAgentCoreMetadata(params);

    const response = await this.transport.call<Mem0AddResponse>({
      method: "add",
      params: {
        messages: [{ role: "user", content: params.content }],
        ...entityFilters,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        infer: true,
      },
    });

    const firstResult = response.results?.[0];

    const now = new Date().toISOString();
    return {
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
  }

  async search(params: MemorySearchParams): Promise<MemorySearchResult[]> {
    const filters = buildMem0SearchFilters(params);
    const searchParams: Record<string, unknown> = {
      query: params.query,
      filters,
    };
    if (params.top_k) searchParams.top_k = params.top_k;
    if (params.threshold) searchParams.threshold = params.threshold;

    const response = await this.transport.call<Mem0SearchResponse>({
      method: "search",
      params: searchParams,
    });
    return (response.results ?? []).map(mem0ToSearchResult);
  }

  async get(id: string): Promise<MemoryRecord | null> {
    try {
      const mem = await this.transport.call<Mem0Memory>({
        method: "get",
        params: { memory_id: id },
      });
      if (!mem?.id || !mem?.memory) return null;
      return mem0ToRecord(mem);
    } catch {
      return null;
    }
  }

  async update(id: string, params: MemoryUpdateParams): Promise<MemoryRecord | null> {
    try {
      // Fetch existing content to avoid erasing it when only metadata changes
      let data = params.content;
      if (data === undefined) {
        const existing = await this.get(id);
        if (!existing) return null;
        data = existing.content;
      }

      const metadata = packAgentCoreMetadata(params);
      await this.transport.call<{ message: string }>({
        method: "update",
        params: {
          memory_id: id,
          data,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        },
      });
      return this.get(id);
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.transport.call<{ success: boolean }>({
        method: "delete",
        params: { memory_id: id },
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Shut down the underlying transport (kill worker, close connections). */
  async shutdown(): Promise<void> {
    await this.transport.shutdown();
  }
}
