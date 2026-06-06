/**
 * PolicyMatcherProvider interface.
 *
 * Expected implementations:
 *   - MockPolicyMatcherProvider (built-in, static rules)
 *   - Parlant-inspired PolicyAdapter (Phase 3, reference only for now)
 *
 * Reference: Parlant GuidelineMatcher, GuidelineMatchingStrategy,
 *            GenericGuidelineMatchingStrategy
 *
 * Parlant concepts mapped to agent-core:
 *   - Guideline → PolicyRule
 *   - GuidelineMatch → PolicyMatchResult
 *   - GuidelineMatchingStrategy → matching strategy pattern
 *   - GuidelineMatchingStrategyResolver → strategy selection per rule
 */

export interface PolicyRule {
  id: string;
  scope: string;
  pattern: string;
  action: "allow" | "deny" | "require_approval";
  requires_approval: boolean;
  approval_type: string | null;
  reason: string;
}

export interface PolicyMatchResult {
  allowed: boolean;
  requires_approval: boolean;
  approval_type: string | null;
  reason: string;
  matched_rules: PolicyRule[];
}

export interface PolicyMatcherProvider {
  readonly name: string;
  readonly status: import("./registry.js").ProviderStatus;

  match(action_name: string, context?: Record<string, unknown>): Promise<PolicyMatchResult>;
  checkPolicy(action_name: string, params: Record<string, unknown>): Promise<PolicyMatchResult>;
}
