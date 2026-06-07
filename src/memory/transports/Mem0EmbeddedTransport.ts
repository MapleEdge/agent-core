/**
 * Embedded Python worker transport for mem0.
 *
 * Spawns `vendor/mem0/worker.py` as a child process and communicates
 * via JSON-RPC over stdin/stdout. The worker's lifecycle is fully
 * managed by agent-core.
 *
 * Why embedded instead of REST:
 *   mem0 is a Python-only library. Its core depends on qdrant-client (C via grpc),
 *   pydantic, openai, sqlalchemy, and protobuf — none of which can run in a
 *   TypeScript process or in WebAssembly (Pyodide). The two options are:
 *
 *   1. REST sidecar: separate process, separate deployment, network overhead,
 *      port management, auth configuration, operational complexity.
 *
 *   2. Embedded worker: child_process with JSON-RPC over stdio. Agent-core
 *      spawns and owns the Python process. No network, no ports, no auth.
 *      Process lifecycle tied to agent-core's lifecycle.
 *
 *   The embedded worker is strictly better for single-node deployments.
 *   REST remains available for shared/multi-instance deployments.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Mem0Transport, Mem0Request } from "./Mem0Transport.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface EmbeddedTransportConfig {
  /** Path to Python executable (default: "python3") */
  pythonPath?: string;
  /** Path to worker script (default: vendor/mem0/worker.py) */
  workerPath?: string;
  /** Environment variables to pass to the worker */
  env?: Record<string, string>;
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
}

export class Mem0EmbeddedTransport implements Mem0Transport {
  readonly mode = "embedded" as const;

  private process: ChildProcess | null = null;
  private readline: ReadlineInterface | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private config: Required<EmbeddedTransportConfig>;
  private stderrBuffer: string[] = [];

  constructor(config: EmbeddedTransportConfig = {}) {
    this.config = {
      pythonPath: config.pythonPath ?? "python3",
      workerPath: config.workerPath ?? resolve(__dirname, "../../../vendor/mem0/worker.py"),
      env: config.env ?? {},
      timeoutMs: config.timeoutMs ?? 30_000,
    };
  }

  /** Spawn the Python worker process. */
  async start(): Promise<void> {
    if (this.process) return;

    const env = { ...process.env, ...this.config.env };

    this.process = spawn(this.config.pythonPath, [this.config.workerPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });

    // Read JSON-RPC responses from stdout
    this.readline = createInterface({ input: this.process.stdout! });
    this.readline.on("line", (line: string) => this.handleLine(line));

    // Capture stderr for diagnostics
    this.process.stderr!.on("data", (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) {
        this.stderrBuffer.push(text);
        // Keep last 50 lines
        if (this.stderrBuffer.length > 50) this.stderrBuffer.shift();
      }
    });

    // Handle unexpected exit
    this.process.on("exit", (code, signal) => {
      const reason = `Worker exited (code=${code}, signal=${signal})`;
      for (const [, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error(reason));
      }
      this.pending.clear();
      this.process = null;
      this.readline = null;
    });

    // Wait for worker to be ready
    const healthy = await this.ping();
    if (!healthy) {
      const logs = this.stderrBuffer.join("\n");
      throw new Error(`mem0 worker failed to start. Logs:\n${logs}`);
    }
  }

  async call<T = unknown>(request: Mem0Request): Promise<T> {
    if (!this.process?.stdin?.writable) {
      await this.start();
    }

    const id = this.nextId++;
    const jsonRpc = JSON.stringify({
      id,
      method: request.method,
      params: request.params,
    });

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`mem0 worker timeout after ${this.config.timeoutMs}ms: ${request.method}`));
      }, this.config.timeoutMs);

      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      this.process!.stdin!.write(jsonRpc + "\n");
    });
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.call<{ status: string; initialized?: boolean }>({
        method: "ping",
        params: {},
      });
      return result.status === "ok" && result.initialized !== false;
    } catch {
      return false;
    }
  }

  async shutdown(): Promise<void> {
    if (!this.process) return;

    try {
      await this.call({ method: "shutdown", params: {} });
    } catch {
      // Worker may already be dead
    }

    // Force kill after 3s if graceful shutdown didn't work
    const proc = this.process;
    if (proc && !proc.killed) {
      const killTimer = setTimeout(() => {
        if (!proc.killed) proc.kill("SIGKILL");
      }, 3000);
      proc.kill("SIGTERM");
      proc.on("exit", () => clearTimeout(killTimer));
    }

    this.process = null;
    this.readline = null;
    this.pending.clear();
  }

  /** Get recent worker stderr output for diagnostics. */
  getWorkerLogs(): string[] {
    return [...this.stderrBuffer];
  }

  private handleLine(line: string): void {
    let response: { id?: number; result?: unknown; error?: { code: number; message: string } };
    try {
      response = JSON.parse(line);
    } catch {
      return; // Ignore malformed lines
    }

    const id = response.id;
    if (id == null) return;

    const pending = this.pending.get(id);
    if (!pending) return;

    this.pending.delete(id);
    clearTimeout(pending.timer);

    if (response.error) {
      pending.reject(new Error(`mem0 worker error: ${response.error.message}`));
    } else {
      pending.resolve(response.result);
    }
  }
}
