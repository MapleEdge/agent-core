/**
 * ActionProvider interface.
 *
 * Expected implementations:
 *   - MockActionProvider (built-in, in-memory registry)
 *   - Letta-inspired ActionAdapter (Phase 2, registry patterns)
 *
 * Reference: Letta tool_manager, cognee execute_tool dispatcher
 */

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

export interface ActionExecutionResult {
  success: boolean;
  output: unknown;
  duration_ms: number;
  error?: string;
}

export interface ActionProvider {
  readonly name: string;

  register(schema: ActionSchema): Promise<ActionSchema>;
  list(): Promise<ActionSchema[]>;
  get(name: string): Promise<ActionSchema | null>;
  validate(name: string, params: Record<string, unknown>): Promise<ActionValidationResult>;
  execute(name: string, params: Record<string, unknown>): Promise<ActionExecutionResult>;
}
