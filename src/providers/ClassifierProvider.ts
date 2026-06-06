/**
 * ClassifierProvider interface.
 *
 * Expected implementations:
 *   - MockClassifierProvider (built-in, keyword-based)
 *   - GeminiClassifierAdapter (Phase 2, strategy pattern from Gemini CLI)
 *
 * Reference: Gemini CLI RoutingStrategy, CompositeStrategy, ClassifierStrategy,
 *            NumericalClassifierStrategy
 *
 * The strategy pattern from Gemini CLI:
 *   - RoutingStrategy: route(context) → Decision | null
 *   - TerminalStrategy: route(context) → Decision (guaranteed)
 *   - CompositeStrategy: chain strategies, fallback to terminal
 */

export interface ClassificationResult {
  intent: "ask" | "do";
  task_type: string;
  complexity_score: number;
  risk_score: number;
  ambiguity_score: number;
  estimated_steps: number;
  requires_approval: string[];
  suggested_sequence: string[];
  reasoning: string;
}

export interface ClassifierProvider {
  readonly name: string;
  readonly status: import("./registry.js").ProviderStatus;

  classify(prompt: string, context?: Record<string, unknown>): Promise<ClassificationResult>;
}
