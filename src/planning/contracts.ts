import type { ProposedActionPlanType, ProposedActionType } from "../schemas/actions.js";
import type { NextActionWithSessionUpdate, SessionUpdateProposal } from "../sessions/sessionUpdateProposal.js";

export interface PlanValidationIssue {
  action_index?: number;
  action_name?: string;
  code: string;
  message: string;
}

export interface ValidatedProposedAction extends ProposedActionType {
  schema_valid: true;
  requires_platform_validation: true;
}

export interface ActionPlanResult {
  ok: boolean;
  plan: ProposedActionPlanType;
  actions: ValidatedProposedAction[];
  issues: PlanValidationIssue[];
  requires_platform_validation: true;
  advisory_only: true;
}

export interface RecommendNextActionResult {
  ok: boolean;
  recommendations: ValidatedProposedAction[];
  issues: PlanValidationIssue[];
  requires_platform_validation: true;
  advisory_only: true;
  session_update?: SessionUpdateProposal;
  next_action?: NextActionWithSessionUpdate;
}
