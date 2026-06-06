/**
 * TraceProvider interface.
 *
 * Expected implementations:
 *   - MockTraceProvider (built-in, SQLite)
 *   - cognee-inspired TraceAdapter (Phase 3, reference only for now)
 *
 * Reference: cognee AgenticRetriever (AgentStep schema), execute_tool dispatcher
 */

export interface TraceRecord {
  id: string;
  session_id: string;
  trace_type: "tool-call" | "skill-run";
  action_name: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  duration_ms: number | null;
  created_at: string;
}

export interface TraceProvider {
  readonly name: string;
  readonly status: import("./registry.js").ProviderStatus;

  recordToolCall(
    session_id: string,
    action_name: string,
    input: Record<string, unknown>,
    output: Record<string, unknown>,
    duration_ms?: number
  ): Promise<TraceRecord>;

  recordSkillRun(
    session_id: string,
    skill_name: string,
    input: Record<string, unknown>,
    output: Record<string, unknown>,
    duration_ms?: number
  ): Promise<TraceRecord>;

  getBySession(session_id: string): Promise<TraceRecord[]>;
}
