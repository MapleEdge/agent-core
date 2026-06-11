import { zodToJsonSchema } from "zod-to-json-schema";
import {
  AdapterFacetSchema,
  ContextProjectionSchema,
  MountSessionRequestSchema,
  MountSessionResultSchema,
  SessionEdgeSchema,
  SessionEventSchema,
  SessionGraphSchema,
  SessionSchema,
} from "./sessionSchemas.js";
import {
  NextActionWithSessionUpdateSchema,
  SessionUpdateProposalSchema,
} from "./sessionUpdateProposal.js";

export const SessionJsonSchema = zodToJsonSchema(SessionSchema, "Session");
export const SessionEdgeJsonSchema = zodToJsonSchema(SessionEdgeSchema, "SessionEdge");
export const SessionEventJsonSchema = zodToJsonSchema(SessionEventSchema, "SessionEvent");
export const AdapterFacetJsonSchema = zodToJsonSchema(AdapterFacetSchema, "AdapterFacet");
export const ContextProjectionJsonSchema = zodToJsonSchema(ContextProjectionSchema, "ContextProjection");
export const MountSessionRequestJsonSchema = zodToJsonSchema(MountSessionRequestSchema, "MountSessionRequest");
export const MountSessionResultJsonSchema = zodToJsonSchema(MountSessionResultSchema, "MountSessionResult");
export const SessionGraphJsonSchema = zodToJsonSchema(SessionGraphSchema, "SessionGraph");
export const SessionUpdateProposalJsonSchema = zodToJsonSchema(SessionUpdateProposalSchema, "SessionUpdateProposal");
export const NextActionWithSessionUpdateJsonSchema = zodToJsonSchema(
  NextActionWithSessionUpdateSchema,
  "NextActionWithSessionUpdate",
);

export const sessionJsonSchemas = {
  Session: SessionJsonSchema,
  SessionEdge: SessionEdgeJsonSchema,
  SessionEvent: SessionEventJsonSchema,
  AdapterFacet: AdapterFacetJsonSchema,
  ContextProjection: ContextProjectionJsonSchema,
  MountSessionRequest: MountSessionRequestJsonSchema,
  MountSessionResult: MountSessionResultJsonSchema,
  SessionGraph: SessionGraphJsonSchema,
  SessionUpdateProposal: SessionUpdateProposalJsonSchema,
  NextActionWithSessionUpdate: NextActionWithSessionUpdateJsonSchema,
};
