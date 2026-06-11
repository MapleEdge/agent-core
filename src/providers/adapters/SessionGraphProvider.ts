import type { GraphValidationResult } from "../../sessions/sessionGraph.js";
import type { SessionUpdateProposal } from "../../sessions/sessionUpdateProposal.js";
import type {
  AdapterMapping,
  ContextProjection,
  MountSessionRequest,
  MountSessionResult,
  Session,
  SessionEdge,
  SessionEvent,
  SessionGraph,
} from "../../sessions/sessionTypes.js";

export interface SessionGraphProvider {
  readonly name: string;

  getGraph(): Promise<SessionGraph>;
  getSession(id: string): Promise<Session | null>;

  createSession(session: Session): Promise<Session>;
  createEdge(edge: SessionEdge): Promise<SessionEdge>;
  appendEvent(event: SessionEvent): Promise<SessionEvent>;

  listEdges(filter?: {
    source_session_id?: string;
    target_session_id?: string;
    type?: SessionEdge["type"];
  }): Promise<SessionEdge[]>;

  listEvents(filter?: {
    session_id?: string;
    type?: SessionEvent["type"];
    root_session_id?: string;
  }): Promise<SessionEvent[]>;

  previewMountSession(request: MountSessionRequest): Promise<MountSessionResult>;
  mountSession(request: MountSessionRequest): Promise<MountSessionResult>;
  unmountSession(request: {
    source_session_id: string;
    target_session_id: string;
    reason?: string;
    remove_adapter_edges?: boolean;
  }): Promise<SessionGraph>;

  applySessionUpdateProposal(proposal: SessionUpdateProposal): Promise<SessionGraph>;

  getProjection(sessionId: string): Promise<ContextProjection | null>;
  buildProjection(input: {
    active_session_id: string;
    source_session_ids: string[];
    projection_mode?: ContextProjection["projection_mode"];
    budget?: Partial<ContextProjection["budget"]>;
    rationale?: string;
  }): Promise<ContextProjection>;

  updateAdapterMappings(input: {
    adaptation_session_id: string;
    mappings: AdapterMapping[];
    mode?: "replace" | "append";
  }): Promise<Session>;

  validateGraph(graph: SessionGraph): Promise<GraphValidationResult>;
}
