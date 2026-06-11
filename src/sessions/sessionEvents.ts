import { randomUUID } from "node:crypto";
import type { SessionEvent, SessionEventType } from "./sessionTypes.js";

export function createEvent(input: {
  type: SessionEventType;
  session_id: string;
  data?: Record<string, unknown>;
  now?: string;
  id?: string;
}): SessionEvent {
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.id ?? `event-${randomUUID()}`,
    type: input.type,
    session_id: input.session_id,
    data: input.data ?? {},
    created_at: now,
  };
}
