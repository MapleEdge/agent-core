import { zodToJsonSchema } from "zod-to-json-schema";
import {
  AdapterFacetSchema,
  ContextProjectionSchema,
  MountSessionRequestSchema,
  MountSessionResultSchema,
  PolicyEvidenceSchema,
  SessionEdgeSchema,
  SessionEventSchema,
  SessionGraphSchema,
  SessionPolicySchema,
  SessionSchema,
} from "./sessionSchemas.js";
import {
  ActionRiskSchema,
  ActionStakesSchema,
  NextActionWithSessionUpdateSchema,
  SessionUpdateClassificationSchema,
  SessionUpdateProposalSchema,
} from "./sessionUpdateProposal.js";

export const SessionJsonSchema = zodToJsonSchema(SessionSchema, "Session");
export const SessionEdgeJsonSchema = zodToJsonSchema(SessionEdgeSchema, "SessionEdge");
export const SessionEventJsonSchema = zodToJsonSchema(SessionEventSchema, "SessionEvent");
export const SessionPolicyJsonSchema = zodToJsonSchema(SessionPolicySchema, "SessionPolicy");
export const PolicyEvidenceJsonSchema = zodToJsonSchema(PolicyEvidenceSchema, "PolicyEvidence");
export const AdapterFacetJsonSchema = zodToJsonSchema(AdapterFacetSchema, "AdapterFacet");
export const ContextProjectionJsonSchema = zodToJsonSchema(ContextProjectionSchema, "ContextProjection");
export const MountSessionRequestJsonSchema = zodToJsonSchema(MountSessionRequestSchema, "MountSessionRequest");
export const MountSessionResultJsonSchema = zodToJsonSchema(MountSessionResultSchema, "MountSessionResult");
export const SessionGraphJsonSchema = zodToJsonSchema(SessionGraphSchema, "SessionGraph");
export const SessionUpdateClassificationJsonSchema = zodToJsonSchema(
  SessionUpdateClassificationSchema,
  "SessionUpdateClassification",
);
export const SessionUpdateProposalJsonSchema = zodToJsonSchema(SessionUpdateProposalSchema, "SessionUpdateProposal");
export const ActionStakesJsonSchema = zodToJsonSchema(ActionStakesSchema, "ActionStakes");
export const ActionRiskJsonSchema = zodToJsonSchema(ActionRiskSchema, "ActionRisk");
export const NextActionWithSessionUpdateJsonSchema = zodToJsonSchema(
  NextActionWithSessionUpdateSchema,
  "NextActionWithSessionUpdate",
);

export const sessionJsonSchemas = {
  Session: SessionJsonSchema,
  SessionEdge: SessionEdgeJsonSchema,
  SessionEvent: SessionEventJsonSchema,
  SessionPolicy: SessionPolicyJsonSchema,
  PolicyEvidence: PolicyEvidenceJsonSchema,
  AdapterFacet: AdapterFacetJsonSchema,
  ContextProjection: ContextProjectionJsonSchema,
  MountSessionRequest: MountSessionRequestJsonSchema,
  MountSessionResult: MountSessionResultJsonSchema,
  SessionGraph: SessionGraphJsonSchema,
  SessionUpdateClassification: SessionUpdateClassificationJsonSchema,
  SessionUpdateProposal: SessionUpdateProposalJsonSchema,
  ActionStakes: ActionStakesJsonSchema,
  ActionRisk: ActionRiskJsonSchema,
  NextActionWithSessionUpdate: NextActionWithSessionUpdateJsonSchema,
};
