/**
 * Thin adapter extracted from claude-mem TimelineService.
 *
 * Provides timeline building and depth-filtered windowing, adapted from:
 *   vendor/providers/knowledge/claude-mem/src/services/worker/TimelineService.ts
 *
 * This is agent-core's first real (non-mock) adapter, demonstrating that
 * vendored provider code can be practically integrated.
 */

export interface TimelineEntry {
  type: "event" | "trace" | "observation";
  id: string;
  epoch: number;
  data: Record<string, unknown>;
}

/**
 * Build a sorted timeline from heterogeneous entries.
 * Adapted from claude-mem TimelineService.buildTimeline().
 */
export function buildTimeline(entries: TimelineEntry[]): TimelineEntry[] {
  return [...entries].sort((a, b) => a.epoch - b.epoch);
}

/**
 * Filter timeline entries to a window around an anchor point.
 * Adapted from claude-mem TimelineService.filterByDepth().
 *
 * @param items - Sorted timeline entries
 * @param anchorId - ID of the anchor entry
 * @param depthBefore - Number of entries before the anchor to include
 * @param depthAfter - Number of entries after the anchor to include
 */
export function filterByDepth(
  items: TimelineEntry[],
  anchorId: string,
  depthBefore: number,
  depthAfter: number,
): TimelineEntry[] {
  if (items.length === 0) return items;

  const anchorIndex = items.findIndex((item) => item.id === anchorId);
  if (anchorIndex === -1) return items;

  const startIndex = Math.max(0, anchorIndex - depthBefore);
  const endIndex = Math.min(items.length, anchorIndex + depthAfter + 1);
  return items.slice(startIndex, endIndex);
}

/**
 * Format timeline entries into a readable string.
 * Simplified from claude-mem TimelineService.formatTimeline().
 */
export function formatTimeline(
  items: TimelineEntry[],
  anchorId?: string,
): string {
  if (items.length === 0) return "No timeline items found";

  const lines: string[] = [];
  if (anchorId) {
    lines.push(`# Timeline around anchor: ${anchorId}`);
  } else {
    lines.push("# Timeline");
  }
  lines.push(`**Items:** ${items.length}`);
  lines.push("");

  for (const item of items) {
    const date = new Date(item.epoch).toISOString();
    const marker = item.id === anchorId ? " ◀ anchor" : "";
    lines.push(`- [${item.type}] ${date} — ${item.id}${marker}`);
  }

  return lines.join("\n");
}
