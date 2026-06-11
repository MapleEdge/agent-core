import type {
  MountSessionRequest,
  MountSessionResult,
  Session,
  SessionEdge,
  SessionGraph,
} from "../../sessions/sessionTypes.js";

export interface SessionGraphProvider {
  readonly name: string;
  getGraph(): Promise<SessionGraph>;
  createSession(session: Session): Promise<Session>;
  createEdge(edge: SessionEdge): Promise<SessionEdge>;
  mountSession(request: MountSessionRequest): Promise<MountSessionResult>;
  validateGraph(graph: SessionGraph): Promise<{ valid: boolean; issues: string[] }>;
}
