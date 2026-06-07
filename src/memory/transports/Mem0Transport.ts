/**
 * Transport abstraction for communicating with mem0.
 *
 * Two implementations:
 *   - Mem0EmbeddedTransport: spawns Python worker as child_process, JSON-RPC over stdin/stdout
 *   - Mem0RestTransport: calls mem0 REST API over HTTP (fallback / existing sidecar)
 *
 * The embedded worker is preferred because it:
 *   - Eliminates separate deployment/container management
 *   - Removes network overhead and port configuration
 *   - Lets agent-core manage the Python process lifecycle
 *   - Is operationally indistinguishable from in-process
 *
 * REST remains as a fallback for environments where:
 *   - Python is not available on the host
 *   - A centralized mem0 server is already running
 *   - Multiple agent-core instances share one mem0 backend
 */

export interface Mem0Request {
  method: string;
  params: Record<string, unknown>;
}

export interface Mem0Transport {
  readonly mode: "embedded" | "rest";

  /** Send a request and get the result. Throws on error. */
  call<T = unknown>(request: Mem0Request): Promise<T>;

  /** Check if the transport is healthy. */
  ping(): Promise<boolean>;

  /** Shut down the transport (kill worker, close connections). */
  shutdown(): Promise<void>;
}
