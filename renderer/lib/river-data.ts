import type { LibraryItem, LibrarySnapshot, MemorySummary } from "@main/shared/types";

import { itemHarnessStyle } from "./harness";
import { itemSearchText, projectLabel } from "./scope";

/**
 * Timeline river layout, candle style. Pure data, no DOM: one lane per project, one
 * candle column per day, and the vertical axis inside a lane is time of day. A
 * session is a segment (clipped to each day it touches) and memories are markers at
 * their last edit. Time → pixels happens in the pane, so zooming never moves items
 * between rows.
 */

export type RiverRelation = "wrote" | "written by" | "uses" | "used by" | "links to" | "linked from";

/** One item's footprint on a single day. Minutes are counted from local midnight. */
export interface DaySegment {
  /** Local midnight of the day, in ms. */
  day: number;
  a: number;
  b: number;
  /** Side-by-side column for sessions that overlap within the day. */
  col: number;
  cols: number;
}

export interface RiverItem {
  id: string;
  kind: "session" | "memory";
  title: string;
  color: string;
  /** Generated memories render hollow, matching the old graph legend. */
  hollow: boolean;
  start: number;
  /** Equal to `start` for memories. */
  end: number;
  lane: number;
  segments: DaySegment[];
  searchText: string;
}

export interface RiverLane {
  /** Project path, or null for Global. */
  key: string | null;
  name: string;
  top: number;
  height: number;
  count: number;
}

export interface RiverData {
  lanes: RiverLane[];
  items: RiverItem[];
  byId: Map<string, RiverItem>;
  related: Map<string, Map<string, RiverRelation>>;
  totalHeight: number;
  minTime: number;
  maxTime: number;
  /** Vertical range shared by every lane, in whole hours (0–24). */
  hourStart: number;
  hourEnd: number;
}

export const RIVER_LANE_HEIGHT = 92;
export const RIVER_PLOT_TOP = 14;
export const RIVER_PLOT_HEIGHT = 62;
const MAX_SEGMENTS_PER_ITEM = 14;
const MIN_HOUR_SPAN = 6;
const DAY_MS = 86_400_000;

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function nextDay(day: number): number {
  const date = new Date(day);
  date.setDate(date.getDate() + 1); // DST-safe
  return date.getTime();
}

/** Minutes from local midnight for a time within `day`. */
function minutesIn(day: number, time: number): number {
  return Math.min(1440, Math.max(0, (time - day) / 60_000));
}

function splitByDay(start: number, end: number): DaySegment[] {
  const segments: DaySegment[] = [];
  for (let day = startOfDay(start); day <= end && segments.length < MAX_SEGMENTS_PER_ITEM; day = nextDay(day)) {
    const a = minutesIn(day, start);
    const b = minutesIn(day, Math.min(end, nextDay(day)));
    segments.push({ day, a, b: Math.max(a, b), col: 0, cols: 1 });
  }
  return segments;
}

/** Y offset inside a lane for a minute-of-day. */
export function minuteY(data: Pick<RiverData, "hourStart" | "hourEnd">, minute: number): number {
  const span = (data.hourEnd - data.hourStart) * 60;
  const fraction = (minute - data.hourStart * 60) / span;
  return RIVER_PLOT_TOP + Math.min(1, Math.max(0, fraction)) * RIVER_PLOT_HEIGHT;
}

export function buildRiver(items: LibraryItem[], library: LibrarySnapshot): RiverData {
  // 1. Group by project; lanes ordered by latest activity, Global last.
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

  // 2. Per lane, place items and pack overlapping sessions into columns per day.
  const lanes: RiverLane[] = [];
  const placed: RiverItem[] = [];
  keys.forEach((key, lane) => {
    const group = groups.get(key)!;
    const laneItems: RiverItem[] = [];
    for (const item of group.items) {
      if (item.kind === "session") {
        const start = item.startedAt || item.updatedAt;
        const end = Math.max(start, item.updatedAt);
        laneItems.push(toRiverItem(item, lane, start, end, splitByDay(start, end)));
      } else {
        const day = startOfDay(item.updatedAt);
        const minute = minutesIn(day, item.updatedAt);
        laneItems.push(toRiverItem(item, lane, item.updatedAt, item.updatedAt, [{ day, a: minute, b: minute, col: 0, cols: 1 }]));
      }
    }
    packColumns(laneItems);
    placed.push(...laneItems);
    lanes.push({
      key,
      name: projectLabel(key, library),
      top: lane * RIVER_LANE_HEIGHT,
      height: RIVER_LANE_HEIGHT,
      count: group.items.length,
    });
  });

  const byId = new Map(placed.map((item) => [item.id, item]));
  const times = placed.flatMap((item) => [item.start, item.end]);
  const now = Date.now();
  const [hourStart, hourEnd] = hourRange(placed);

  return {
    lanes,
    items: placed,
    byId,
    related: buildRelations(items, byId),
    totalHeight: lanes.length * RIVER_LANE_HEIGHT,
    minTime: times.length ? Math.min(...times) : now - 7 * DAY_MS,
    maxTime: Math.max(now, ...times),
    hourStart,
    hourEnd,
  };
}

/** Greedy interval packing per day so simultaneous sessions sit side by side. */
function packColumns(laneItems: RiverItem[]) {
  const byDay = new Map<number, DaySegment[]>();
  for (const item of laneItems) {
    if (item.kind !== "session") continue;
    for (const segment of item.segments) {
      const list = byDay.get(segment.day) ?? [];
      list.push(segment);
      byDay.set(segment.day, list);
    }
  }
  for (const segments of byDay.values()) {
    segments.sort((x, y) => x.a - y.a);
    const columnEnds: number[] = [];
    for (const segment of segments) {
      let col = columnEnds.findIndex((end) => segment.a >= end);
      if (col === -1) col = columnEnds.push(0) - 1;
      columnEnds[col] = Math.max(segment.b, segment.a + 20); // a short session still occupies its glyph
      segment.col = col;
    }
    for (const segment of segments) segment.cols = columnEnds.length;
  }
}

/** Whole-hour range covering all activity, so empty night hours don't waste height. */
function hourRange(items: RiverItem[]): [number, number] {
  let lo = 1440;
  let hi = 0;
  for (const item of items) {
    for (const segment of item.segments) {
      lo = Math.min(lo, segment.a);
      hi = Math.max(hi, segment.b);
    }
  }
  if (lo > hi) return [8, 20];
  let start = Math.floor(lo / 60);
  let end = Math.min(24, Math.ceil(hi / 60));
  if (end <= start) end = start + 1;
  const missing = MIN_HOUR_SPAN - (end - start);
  if (missing > 0) {
    start = Math.max(0, start - Math.floor(missing / 2));
    end = Math.min(24, start + MIN_HOUR_SPAN);
    start = Math.max(0, end - MIN_HOUR_SPAN);
  }
  return [start, end];
}

function toRiverItem(item: LibraryItem, lane: number, start: number, end: number, segments: DaySegment[]): RiverItem {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    color: itemHarnessStyle(item).color,
    hollow: item.kind === "memory" && item.memoryType === "generated",
    start,
    end,
    lane,
    segments,
    searchText: itemSearchText(item),
  };
}

/** Same edges the old graph drew (memory links, files touched, generated-by), as an adjacency map. */
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
