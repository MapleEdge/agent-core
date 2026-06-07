/**
 * REST transport for mem0 — calls an external mem0 HTTP server.
 *
 * Use this when:
 *   - A centralized mem0 server is already running
 *   - Multiple agent-core instances share one mem0 backend
 *   - Python is not available on the agent-core host
 *
 * For single-node deployments, prefer Mem0EmbeddedTransport.
 */

import type { Mem0Transport, Mem0Request } from "./Mem0Transport.js";

export interface RestTransportConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}

/** Map JSON-RPC method names to REST endpoints. */
const METHOD_TO_ENDPOINT: Record<string, { method: string; pathFn: (p: Record<string, unknown>) => string }> = {
  add: { method: "POST", pathFn: () => "/memories" },
  search: { method: "POST", pathFn: () => "/search" },
  get: { method: "GET", pathFn: (p) => `/memories/${p.memory_id}` },
  get_all: { method: "GET", pathFn: () => "/memories" },
  update: { method: "PUT", pathFn: (p) => `/memories/${p.memory_id}` },
  delete: { method: "DELETE", pathFn: (p) => `/memories/${p.memory_id}` },
  history: { method: "GET", pathFn: (p) => `/memories/${p.memory_id}/history` },
  ping: { method: "GET", pathFn: () => "/api/health" },
};

export class Mem0RestTransport implements Mem0Transport {
  readonly mode = "rest" as const;

  private config: Required<RestTransportConfig>;

  constructor(config: RestTransportConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/+$/, ""),
      apiKey: config.apiKey ?? "",
      timeoutMs: config.timeoutMs ?? 30_000,
    };
  }

  async call<T = unknown>(request: Mem0Request): Promise<T> {
    const route = METHOD_TO_ENDPOINT[request.method];
    if (!route) {
      throw new Error(`Unsupported REST method: ${request.method}`);
    }

    const url = `${this.config.baseUrl}${route.pathFn(request.params)}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    const init: RequestInit = { method: route.method, headers };

    // Build request body — strip path params, send rest as body for POST/PUT
    if (route.method === "POST" || route.method === "PUT") {
      const body = { ...request.params };
      delete body.memory_id;
      init.body = JSON.stringify(body);
    }

    // For GET requests, encode remaining params as query string
    let finalUrl = url;
    if (route.method === "GET") {
      const queryParams = { ...request.params };
      delete queryParams.memory_id;
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(queryParams)) {
        if (v !== undefined && v !== null) {
          qs.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
        }
      }
      const qsStr = qs.toString();
      if (qsStr) {
        const sep = finalUrl.includes("?") ? "&" : "?";
        finalUrl = `${finalUrl}${sep}${qsStr}`;
      }
    }

    const res = await fetch(finalUrl, { ...init, signal: AbortSignal.timeout(this.config.timeoutMs) });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`mem0 REST ${route.method} ${url} failed (${res.status}): ${text}`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await res.json()) as T;
    }
    return {} as T;
  }

  async ping(): Promise<boolean> {
    try {
      await this.call({ method: "ping", params: {} });
      return true;
    } catch {
      return false;
    }
  }

  async shutdown(): Promise<void> {
    // Nothing to clean up for REST transport
  }
}
