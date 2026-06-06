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

export interface SessionProvider {
  readonly name: string;
  readonly status: import("./registry.js").ProviderStatus;

  create(repo_id?: string): Promise<SessionRecord>;
  get(id: string): Promise<SessionRecord | null>;
  addEvent(session_id: string, event_type: string, data: Record<string, unknown>): Promise<SessionEvent>;
  getTimeline(session_id: string): Promise<TimelineItem[]>;
  updateSummary(session_id: string, summary: string): Promise<SessionRecord | null>;
}
