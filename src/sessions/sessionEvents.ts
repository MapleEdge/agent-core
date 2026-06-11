import { randomUUID } from "node:crypto";
import type { SessionEvent, SessionEventActor, SessionEventType } from "./sessionTypes.js";

export function createEvent(input: {
  type: SessionEventType;
  session_id: string;
  root_session_id?: string | null;
  actor?: SessionEventActor;
  data?: Record<string, unknown>;
  now?: string;
  id?: string;
}): SessionEvent {
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.id ?? `event-${randomUUID()}`,
    type: input.type,
    session_id: input.session_id,
    root_session_id: input.root_session_id ?? null,
    actor: input.actor ?? "system",
    data: input.data ?? {},
    created_at: now,
  };
}
