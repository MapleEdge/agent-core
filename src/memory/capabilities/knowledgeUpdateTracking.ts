/**
 * Knowledge update tracking — detect and record when stored facts change.
 *
 * Pattern: delegates to mem0 history() for change log.
 * Agent-core owns the semantics of what constitutes a "knowledge update".
 */

import type { Mem0Transport } from "../transports/Mem0Transport.js";
import type { MemoryProvider } from "../../providers/MemoryProvider.js";
import type { KnowledgeUpdate } from "./types.js";

interface Mem0HistoryEntry {
  id: string;
  memory_id: string;
  old_memory: string | null;
  new_memory: string | null;
  event: string;
  created_at: string;
}

/**
 * Get history for a memory via mem0 transport.
 * Falls back to comparing current vs previous content if transport unavailable.
 */
export async function getMemoryHistory(
  memoryId: string,
  transport?: Mem0Transport,
): Promise<KnowledgeUpdate[]> {
  if (!transport) return [];

  try {
    const history = await transport.call<Mem0HistoryEntry[]>({
      method: "history",
      params: { memory_id: memoryId },
    });

    if (!Array.isArray(history)) return [];

    return history.map((entry) => ({
      memory_id: entry.memory_id,
      previous_content: entry.old_memory,
      current_content: entry.new_memory ?? "",
      change_type: eventToChangeType(entry.event),
      timestamp: entry.created_at,
    }));
  } catch {
    return [];
  }
}

function eventToChangeType(event: string): "created" | "updated" | "deleted" {
  switch (event?.toLowerCase()) {
    case "add":
    case "create":
      return "created";
    case "delete":
    case "remove":
      return "deleted";
    default:
      return "updated";
  }
}

/**
 * Detect if a memory has been updated since a given timestamp.
 * Useful for knowledge freshness checks.
 */
export async function hasUpdatedSince(
  memoryId: string,
  since: string,
  transport?: Mem0Transport,
): Promise<boolean> {
  const history = await getMemoryHistory(memoryId, transport);
  const sinceTime = new Date(since).getTime();
  return history.some((u) => new Date(u.timestamp).getTime() > sinceTime);
}

/**
 * Track updates by comparing memory state before and after a write.
 * This works with any MemoryProvider (not just mem0).
 */
export async function trackUpdate(
  memoryId: string,
  memory: MemoryProvider,
  beforeContent: string | null,
): Promise<KnowledgeUpdate | null> {
  const current = await memory.get(memoryId);
  if (!current) {
    if (beforeContent !== null) {
      return {
        memory_id: memoryId,
        previous_content: beforeContent,
        current_content: "",
        change_type: "deleted",
        timestamp: new Date().toISOString(),
      };
    }
    return null;
  }

  if (beforeContent === null) {
    return {
      memory_id: memoryId,
      previous_content: null,
      current_content: current.content,
      change_type: "created",
      timestamp: current.updated_at,
    };
  }

  if (current.content !== beforeContent) {
    return {
      memory_id: memoryId,
      previous_content: beforeContent,
      current_content: current.content,
      change_type: "updated",
      timestamp: current.updated_at,
    };
  }

  return null;
}
