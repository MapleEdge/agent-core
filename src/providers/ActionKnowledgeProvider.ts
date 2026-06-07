/**
 * ActionKnowledgeProvider interface.
 *
 * Extends ActionProvider with advisory planning, recommendation, and outcome
 * recording capabilities. Borrows patterns from:
 *   - Letta: tool registry, allowed-next-action solver, sequence validation
 *   - LangGraph: plans as resumable state machines
 *   - MCP: standardized action definitions with JSON Schema
 *   - OpenHands/SWE-agent: action→observation→next-action trajectories
 *   - cognee/claude-mem: trace→memory outcome learning loop
 *
 * EXECUTION BOUNDARY: ActionKnowledgeProvider answers "what actions exist,
 * what is allowed next, what plan should I follow, what happened last time."
 * It does NOT execute actions. Execution belongs in the platform
 * (jubilant-goggles).
 */

import type { ActionProvider } from "./ActionProvider.js";
import type { ProviderStatus } from "./registry.js";

// ── Action Definition (MCP-compatible) ──────────────────────────────

export interface ActionDefinition {
  name: string;
  description: string;
  /** MCP-compatible input schema. */
  params_json_schema: Record<string, unknown>;
  /** Expected output shape (advisory, not enforced). */
  output_json_schema: Record<string, unknown>;
  risk: "low" | "medium" | "high" | "critical";
  side_effects: string[];
  /**
   * Always true in agent-core — final authorization belongs to the platform.
   * Included so every response explicitly marks the boundary.
   */
  requires_platform_validation: boolean;
}

// ── Recommendation ──────────────────────────────────────────────────

export interface ActionRecommendationContext {
  task_type: string;
  current_action?: string;
  completed_actions: string[];
  context: Record<string, unknown>;
}

export interface ActionRecommendation {
  action_name: string;
  params: Record<string, unknown>;
  schema_valid: boolean;
  requires_platform_validation: true;
  confidence: number;
  rationale: string;
}

// ── Plan ────────────────────────────────────────────────────────────

export interface ActionPlanContext {
  task_type: string;
  prompt: string;
  repo_id?: string;
  context?: Record<string, unknown>;
}

export interface ActionPlanStep {
  action_name: string;
  params: Record<string, unknown>;
  requires_platform_validation: true;
}

export interface ActionPlan {
  task_type: string;
  steps: ActionPlanStep[];
  state: {
    current_action: string | null;
    completed_actions: string[];
    known_risks: string[];
    missing_context: string[];
  };
}

export interface ActionPlanValidationResult {
  valid: boolean;
  errors: string[];
  /** Per-step validation details. */
  step_results: Array<{
    step_index: number;
    action_name: string;
    schema_valid: boolean;
    sequence_valid: boolean;
    errors: string[];
  }>;
}

// ── Outcome ─────────────────────────────────────────────────────────

export interface ActionOutcomeRecord {
  session_id: string;
  action_name: string;
  params: Record<string, unknown>;
  status: "succeeded" | "failed" | "skipped";
  output: Record<string, unknown>;
  duration_ms: number;
  executor: string;
  rationale?: string;
  error?: string;
  files_touched?: string[];
  test_result?: string;
}

export interface StoredOutcome extends ActionOutcomeRecord {
  id: string;
  created_at: string;
}

// ── Provider Interface ──────────────────────────────────────────────

export interface ActionKnowledgeProvider extends ActionProvider {
  readonly name: string;
  readonly status: ProviderStatus;

  /** List all actions as MCP-compatible definitions. */
  listActions(): Promise<ActionDefinition[]>;

  /** Get a single action definition. */
  getAction(name: string): Promise<ActionDefinition | null>;

  /** Recommend next actions given current context. Uses rule solver + outcome history. */
  recommendNextActions(context: ActionRecommendationContext): Promise<ActionRecommendation[]>;

  /** Build an advisory plan for a task. Plans are state, not execution. */
  buildPlan(context: ActionPlanContext): Promise<ActionPlan>;

  /** Validate a proposed plan against schemas and sequence rules. */
  validatePlan(plan: ActionPlan): Promise<ActionPlanValidationResult>;

  /** Record what the platform actually executed. Feeds outcome learning. */
  recordActionOutcome(outcome: ActionOutcomeRecord): Promise<StoredOutcome>;

  /** Get outcome history for a session. */
  getOutcomes(session_id: string): Promise<StoredOutcome[]>;

  /** Get aggregated outcome stats for an action (success rate, avg duration). */
  getActionStats(action_name: string): Promise<{
    total: number;
    succeeded: number;
    failed: number;
    avg_duration_ms: number;
  }>;
}
