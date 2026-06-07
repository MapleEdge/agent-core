/**
 * SessionProvider interface.
 *
 * Expected implementations:
 *   - MockSessionProvider (built-in, SQLite)
 *   - claude-mem-inspired SessionAdapter (Phase 2, direct TS integration)
 *
 * Reference: claude-mem SessionStore, TimelineService
 */

export interface SessionRecord {
  id: string;
  repo_id: string | null;
  status: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionEvent {
  id: string;
  session_id: string;
  event_type: string;
  data: Record<string, unknown>;
  created_at: string;
}

export interface TimelineItem {
  type: "event" | "trace";
  id: string;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Reference: Parlant SessionStore
 *   vendor/providers/policy/parlant/src/parlant/core/sessions.py:292-327
 *   Parlant defines create_session, delete_session, update_session,
 *   list_sessions as abstract methods.
 *
 * Our interface adds:
 *   - close() to transition status from active → closed (Parlant handles
 *     this via update_session with a params dict; we make it explicit).
 *   - list() with status filter (Parlant's list_sessions also filters
 *     by agent_id and customer_id; we filter by status and repo_id).
 */
export interface SessionProvider {
  readonly name: string;
  readonly status: import("./registry.js").ProviderStatus;

  create(repo_id?: string): Promise<SessionRecord>;
  get(id: string): Promise<SessionRecord | null>;
  list(opts?: { status?: string; repo_id?: string; limit?: number }): Promise<SessionRecord[]>;
  close(id: string, summary?: string): Promise<SessionRecord | null>;
  delete(id: string): Promise<boolean>;
  addEvent(session_id: string, event_type: string, data: Record<string, unknown>): Promise<SessionEvent>;
  getTimeline(session_id: string): Promise<TimelineItem[]>;
  updateSummary(session_id: string, summary: string): Promise<SessionRecord | null>;
}
