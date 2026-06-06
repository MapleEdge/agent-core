/**
 * ActionProvider interface.
 *
 * Expected implementations:
 *   - MockActionProvider (built-in, in-memory registry)
 *   - Letta-inspired ActionAdapter (Phase 2, registry patterns)
 *
 * Reference: Letta tool_manager, cognee execute_tool dispatcher
 *
 * EXECUTION BOUNDARY: agent-core must NOT execute high-stakes actions
 * directly. All ActionProvider.execute() calls in this repo are mock or
 * local-safe only. Real side effects (file writes outside fixtures, shell
 * commands, deployments, payments, commits) are authorized and executed
 * by the future platform, never by agent-core.
 */

import type { ProviderStatus } from "./registry.js";

export interface ActionSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  risk_level: "low" | "medium" | "high" | "critical";
  requires_approval: boolean;
}

export interface ActionValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * execution_mode indicates the safety level of this execution:
 *   - "mock": no real side effects, returns simulated output
 *   - "local_safe": reads from fixtures only, no external I/O
 *
 * agent-core never produces "live" execution. The future platform owns
 * real action execution, authorization, and side-effect management.
 */
export interface ActionExecutionResult {
  success: boolean;
  output: unknown;
  duration_ms: number;
  execution_mode: "mock" | "local_safe";
  error?: string;
}

export interface ActionProvider {
  readonly name: string;
  readonly status: ProviderStatus;

  register(schema: ActionSchema): Promise<ActionSchema>;
  list(): Promise<ActionSchema[]>;
  get(name: string): Promise<ActionSchema | null>;
  validate(name: string, params: Record<string, unknown>): Promise<ActionValidationResult>;

  /**
   * Execute an action in mock/local-safe mode only.
   * agent-core must not execute real side effects. The future platform
   * authorizes and executes real actions; this method exists for
   * testing and demonstration purposes.
   */
  execute(name: string, params: Record<string, unknown>): Promise<ActionExecutionResult>;
}
