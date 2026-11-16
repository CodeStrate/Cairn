import type { LibraryItem, LibrarySnapshot, MemorySummary } from "@main/shared/types";

import { itemHarnessStyle } from "./harness";
import { itemSearchText, projectLabel } from "./scope";

/**
 * Timeline river data. Pure, no DOM: one lane per project (newest activity first,
 * Global last), items with their time span, and the relations hover highlights.
 * Rows inside a lane are packed by the pane in pixel space (see `packLane`), because
 * whether two labelled bars collide depends on the zoom level.
 */

export type RiverRelation =
  | "wrote"
  | "written by"
  | "uses"
  | "used by"
  | "links to"
  | "linked from";

export interface RiverItem {
  id: string;
  kind: "session" | "memory";
  title: string;
  color: string;
  /** Generated memories render hollow, matching the graph legend. */
  hollow: boolean;
  start: number;
  /** Equal to `start` for memories. */
  end: number;
  lane: number;
  searchText: string;
}

export interface RiverLane {
  /** Project path, or null for Global. */
  key: string | null;
  name: string;
  count: number;
}

export interface RiverData {
  lanes: RiverLane[];
  items: RiverItem[];
  byLane: RiverItem[][];
  byId: Map<string, RiverItem>;
  related: Map<string, Map<string, RiverRelation>>;
  minTime: number;
  maxTime: number;
}

const DAY_MS = 86_400_000;

export function buildRiver(items: LibraryItem[], library: LibrarySnapshot): RiverData {
  const groups = new Map<string | null, { items: LibraryItem[]; last: number }>();
  for (const item of items) {
    const group = groups.get(item.cwd) ?? { items: [], last: 0 };
    group.items.push(item);
    group.last = Math.max(group.last, item.updatedAt);
    groups.set(item.cwd, group);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return groups.get(b)!.last - groups.get(a)!.last;
  });

  const lanes: RiverLane[] = [];
  const byLane: RiverItem[][] = [];
  keys.forEach((key, lane) => {
    const group = groups.get(key)!;
    lanes.push({ key, name: projectLabel(key, library), count: group.items.length });
    byLane.push(
      group.items
        .map((item) => toRiverItem(item, lane))
        .sort((a, b) => a.start - b.start || a.end - b.end),
    );
  });

  const all = byLane.flat();
  const byId = new Map(all.map((item) => [item.id, item]));
  const now = Date.now();
  let minTime = Infinity;
  let maxTime = now;
  for (const item of all) {
    minTime = Math.min(minTime, item.start);
    maxTime = Math.max(maxTime, item.end);
  }

  return {
    lanes,
    items: all,
    byLane,
    byId,
    related: buildRelations(items, byId),
    minTime: Number.isFinite(minTime) ? minTime : now - 7 * DAY_MS,
    maxTime,
  };
}

function toRiverItem(item: LibraryItem, lane: number): RiverItem {
  const start = item.kind === "session" ? item.startedAt || item.updatedAt : item.updatedAt;
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    color: itemHarnessStyle(item).color,
    hollow: item.kind === "memory" && item.memoryType === "generated",
    start,
    end: Math.max(start, item.updatedAt),
    lane,
    searchText: itemSearchText(item),
  };
}

/**
 * Greedy row packing in pixels: an item takes the first row whose previous occupant
 * (bar plus label) ends before this one starts. `extent` returns [left, right] in px.
 */
export function packLane(items: RiverItem[], extent: (item: RiverItem) => [number, number]) {
  const rowEnds: number[] = [];
  const rows = new Map<string, number>();
  for (const item of items) {
    const [left, right] = extent(item);
    let row = rowEnds.findIndex((end) => left >= end);
    if (row === -1) row = rowEnds.push(0) - 1;
    rowEnds[row] = right;
    rows.set(item.id, row);
  }
  return { rows, rowCount: Math.max(1, rowEnds.length) };
}

/** Same edges the graph draws (memory links, files touched, generated-by), as an adjacency map. */
function buildRelations(items: LibraryItem[], present: Map<string, RiverItem>) {
  const related = new Map<string, Map<string, RiverRelation>>();
  const add = (from: string, to: string, forward: RiverRelation, backward: RiverRelation) => {
    if (from === to || !present.has(from) || !present.has(to)) return;
    const a = related.get(from) ?? new Map<string, RiverRelation>();
    const b = related.get(to) ?? new Map<string, RiverRelation>();
    if (!a.has(to)) a.set(to, forward);
    if (!b.has(from)) b.set(from, backward);
    related.set(from, a);
    related.set(to, b);
  };

  const memoriesByPath = new Map<string, MemorySummary>();
  for (const item of items) if (item.kind === "memory") memoriesByPath.set(item.path, item);

  for (const item of items) {
    if (item.kind === "memory") {
      // "wrote" first so it wins over a weaker "uses" for the same pair.
      if (item.sessionId) add(item.sessionId, item.id, "wrote", "written by");
      for (const target of item.links) add(item.id, target, "links to", "linked from");
    }
  }
  for (const item of items) {
    if (item.kind !== "session") continue;
    for (const file of item.filesTouched) {
      const memory = memoriesByPath.get(file);
      if (memory) add(item.id, memory.id, "uses", "used by");
    }
  }
  return related;
}
