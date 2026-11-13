import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Maximize, Minus, Plus } from "lucide-react";
import { Button, EmptyState, Text } from "@glaze/core/components";

import type { HarnessId, LibraryItem, LibrarySnapshot } from "@main/shared/types";

import { HARNESS_ORDER, HARNESS_STYLES, SHARED_STYLE } from "../lib/harness";
import { buildRiver, minuteY, type DaySegment, type RiverData, type RiverItem } from "../lib/river-data";
import { HarnessDot } from "./item-visuals";

interface RiverPaneProps {
  toolbar: ReactNode;
  library: LibrarySnapshot | undefined;
  items: LibraryItem[];
  query: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenProject: (projectPath: string) => void;
}

/** Visible time window: `t0` is the time at the left edge, `k` is pixels per ms. */
interface Viewport {
  t0: number;
  k: number;
}

const GUTTER = 168;
const AXIS = 30;
const DAY = 86_400_000;
// Zoom is bounded by day width, so zooming out can't shrink candles into dots.
const MIN_DAY_PX = 34;
const MAX_DAY_PX = 260;
const FIT_MAX_DAY_PX = 110;
const MIN_K = MIN_DAY_PX / DAY;
const MAX_K = MAX_DAY_PX / DAY;
const MAX_FLOATING_LABELS = 14;
const MIN_SEGMENT_PX = 7;
/** Where inside a day column the candle and the memory markers sit. */
const CANDLE_AT = 0.36;
const MEMORY_AT = 0.8;

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function clampK(k: number) {
  return Math.min(Math.max(k, MIN_K), MAX_K);
}

/** Show as many days as fit at a readable width, newest on the right; short histories start at the left. */
function fitViewport(river: RiverData, width: number): Viewport {
  const first = startOfDay(river.minTime);
  const last = startOfDay(river.maxTime) + DAY;
  const days = Math.max(1, (last - first) / DAY);
  const k = clampK(Math.min(Math.max(width / days, MIN_DAY_PX), FIT_MAX_DAY_PX) / DAY);
  return { t0: days * k * DAY <= width ? first : last - width / k, k };
}

/** Keep the window within the data (plus slack) so panning can't lose the timeline. */
function clampView(view: Viewport, river: RiverData, width: number): Viewport {
  const k = clampK(view.k);
  const lo = startOfDay(river.minTime) - 2 * DAY;
  const hi = startOfDay(river.maxTime) + 3 * DAY - width / k;
  return { t0: Math.min(Math.max(view.t0, lo), Math.max(lo, hi)), k };
}

function candleWidth(dayPx: number) {
  return Math.min(Math.max(dayPx * 0.46, 6), 24);
}

/** Midnights inside the window, so each day can be a shaded band. */
function visibleDays(view: Viewport, width: number): number[] {
  const first = new Date(view.t0);
  first.setHours(0, 0, 0, 0);
  const end = view.t0 + width / view.k;
  const days: number[] = [];
  for (let t = first.getTime(); t < end && days.length < 800; ) {
    days.push(t);
    const next = new Date(t);
    next.setDate(next.getDate() + 1); // DST-safe
    t = next.getTime();
  }
  return days;
}

const dayShort = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const dayLong = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });

function hourLabel(hour: number) {
  return `${String(hour % 24).padStart(2, "0")}:00`;
}

function MemoryGlyph({ hollow }: { hollow?: boolean }) {
  return (
    <svg viewBox="0 0 10 10" className="size-2.5 shrink-0 text-secondary" aria-hidden>
      {hollow ? (
        <path d="M5 1.2 8.8 5 5 8.8 1.2 5Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      ) : (
        <path d="M5 0.5 9.5 5 5 9.5 0.5 5Z" fill="currentColor" />
      )}
    </svg>
  );
}

function LegendEntry({ glyph, label }: { glyph: ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {glyph}
      <Text variant="small" color="secondary">
        {label}
      </Text>
    </span>
  );
}

export function RiverPane({ toolbar, library, items, query, selectedId, onSelect, onOpenProject }: RiverPaneProps) {
  const river = library ? buildRiver(items, library) : null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // null = "fit"; becomes explicit as soon as the user pans or zooms.
  const [manualView, setManualView] = useState<Viewport | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const dragRef = useRef<{ x: number; t0: number; k: number; moved: boolean; id: string | null } | null>(null);

  const view = manualView ?? (river ? fitViewport(river, width) : { t0: 0, k: 1 });
  const viewRef = useRef(view);
  const riverRef = useRef(river);
  const widthRef = useRef(width);
  useEffect(() => {
    viewRef.current = view;
    riverRef.current = river;
    widthRef.current = width;
  });

  const commitView = (next: Viewport) => {
    if (river) setManualView(clampView(next, river, width));
  };

  // Width of the timeline column (pane minus gutter).
  useEffect(() => {
    const element = axisRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // ⌘/Ctrl + wheel (and trackpad pinch) zooms around the cursor; horizontal wheel pans.
  // Native listener because React's onWheel is passive and can't preventDefault.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      const current = viewRef.current;
      const data = riverRef.current;
      if (!data) return;
      const px = event.clientX - element.getBoundingClientRect().left - GUTTER;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const t = current.t0 + px / current.k;
        const k = clampK(current.k * Math.exp(-event.deltaY * 0.01));
        setManualView(clampView({ t0: t - px / k, k }, data, widthRef.current));
      } else if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        event.preventDefault();
        setManualView(clampView({ t0: current.t0 + event.deltaX / current.k, k: current.k }, data, widthRef.current));
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const zoomBy = (factor: number) => {
    const px = width / 2;
    const t = view.t0 + px / view.k;
    const k = clampK(view.k * factor);
    commitView({ t0: t - px / k, k });
  };

  const x = (t: number) => (t - view.t0) * view.k;
  const dayPx = DAY * view.k;
  const bodyWidth = candleWidth(dayPx);

  // Search fades non-matches; hover/selection fades everything unrelated.
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches =
    river && terms.length > 0
      ? new Set(river.items.filter((item) => terms.every((term) => item.searchText.includes(term))).map((item) => item.id))
      : null;
  const focusId = hoverId ?? selectedId;
  const focus = focusId && river?.byId.has(focusId) ? focusId : null;
  const related = focus ? (river?.related.get(focus) ?? new Map()) : null;
  const isLit = (id: string) => (!focus || id === focus || related!.has(id)) && (!matches || matches.has(id));
  const laneLit = (lane: number) =>
    !river || !focus || river.items.some((item) => item.lane === lane && (item.id === focus || related!.has(item.id)));

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = (event.target as Element).closest("[data-id]");
    dragRef.current = { x: event.clientX, t0: view.t0, k: view.k, moved: false, id: target?.getAttribute("data-id") ?? null };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 4) return;
    drag.moved = true;
    commitView({ t0: drag.t0 - dx / drag.k, k: drag.k });
  };
  const handlePointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.moved) onSelect(drag.id);
  };

  const harnessesPresent = new Set<HarnessId>();
  let hasShared = false;
  let hasGenerated = false;
  for (const item of items) {
    if (item.kind === "session") harnessesPresent.add(item.harness);
    else {
      if (item.harnesses.length === 1) harnessesPresent.add(item.harnesses[0]);
      else hasShared = true;
      if (item.memoryType === "generated") hasGenerated = true;
    }
  }

  const days = river && width > 0 ? visibleDays(view, width) : [];
  const labelEvery = Math.max(1, Math.ceil(70 / dayPx));
  const height = river?.totalHeight ?? 0;

  // Candle geometry. Segments are laid out within the day column; the wick spans the
  // active stretch of the day so gaps between sessions read as thin line.
  const candleX = (segment: DaySegment) => x(segment.day) + dayPx * CANDLE_AT - bodyWidth / 2;
  const segmentRect = (segment: DaySegment, lane: number) => {
    const top = river!.lanes[lane].top;
    const ya = top + minuteY(river!, segment.a);
    const yb = top + minuteY(river!, segment.b);
    const w = bodyWidth / segment.cols;
    return { x: candleX(segment) + segment.col * w, y: ya, w: Math.max(w - 1, 3), h: Math.max(yb - ya, MIN_SEGMENT_PX) };
  };

  const wicks = new Map<string, { x: number; lo: number; hi: number }>();
  if (river) {
    for (const item of river.items) {
      if (item.kind !== "session") continue;
      for (const segment of item.segments) {
        const rect = segmentRect(segment, item.lane);
        const key = `${item.lane}:${segment.day}`;
        const wick = wicks.get(key) ?? { x: candleX(segment) + bodyWidth / 2, lo: Infinity, hi: -Infinity };
        wick.lo = Math.min(wick.lo, rect.y);
        wick.hi = Math.max(wick.hi, rect.y + rect.h);
        wicks.set(key, wick);
      }
    }
  }

  const floating: { item: RiverItem; left: number; top: number; strong: boolean }[] = [];
  if (river && focus) {
    for (const id of [focus, ...related!.keys()].slice(0, MAX_FLOATING_LABELS)) {
      const item = river.byId.get(id)!;
      const segment = item.segments[item.segments.length - 1];
      let left: number;
      let top: number;
      if (item.kind === "session") {
        const rect = segmentRect(segment, item.lane);
        left = rect.x + bodyWidth + 6;
        top = rect.y + rect.h / 2 - 9;
      } else {
        left = x(segment.day) + dayPx * MEMORY_AT + 9;
        top = river.lanes[item.lane].top + minuteY(river, segment.a) - 22;
      }
      if (left < 0 || left > width) continue;
      floating.push({ item, left, top, strong: id === focus });
    }
  }

  // Faint hour guides, labelled on the first lane only.
  const hourSpan = river ? river.hourEnd - river.hourStart : 0;
  const hourStep = hourSpan <= 8 ? 1 : hourSpan <= 14 ? 2 : 3;
  const guideHours: number[] = [];
  if (river) for (let h = Math.ceil(river.hourStart / hourStep) * hourStep; h <= river.hourEnd; h += hourStep) guideHours.push(h);

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {toolbar}

      {/* Day axis */}
      <div className="flex shrink-0" style={{ height: AXIS }}>
        <div style={{ width: GUTTER }} className="shrink-0" />
        <div ref={axisRef} className="min-w-0 flex-1 overflow-hidden">
          <svg width={width} height={AXIS} className="block text-tertiary">
            {days.map((t) =>
              Math.round(t / DAY) % labelEvery ? null : (
                <text key={t} x={x(t) + 6} y={19} fontSize={11} fill="currentColor" className="tabular-nums">
                  {(dayPx > 110 ? dayLong : dayShort).format(t)}
                </text>
              ),
            )}
          </svg>
        </div>
      </div>

      {/* Lanes */}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-12">
        <div className="relative flex" style={{ height }}>
          {/* Project gutter */}
          <div className="relative shrink-0" style={{ width: GUTTER }}>
            {river?.lanes.map((lane, index) => (
              <button
                key={lane.key ?? "global"}
                type="button"
                disabled={lane.key === null}
                onClick={() => lane.key && onOpenProject(lane.key)}
                className="absolute inset-x-0 flex items-center gap-2 pr-3 pl-4 text-left transition-opacity"
                style={{ top: lane.top + 8, height: 20, opacity: laneLit(index) ? 1 : 0.3 }}
                title={lane.key ?? "Global memories"}
              >
                <Text variant="small" className="min-w-0 flex-1 truncate">
                  {lane.name}
                </Text>
                <Text variant="small" color="tertiary" className="tabular-nums">
                  {lane.count}
                </Text>
              </button>
            ))}
          </div>

          {/* Timeline */}
          <div
            className="relative min-w-0 flex-1 cursor-grab touch-pan-y overflow-hidden select-none active:cursor-grabbing"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => (dragRef.current = null)}
          >
            {river ? (
              <svg
                width={width}
                height={height}
                className="block"
                onPointerOver={(event) => {
                  if (dragRef.current?.moved) return;
                  const id = (event.target as Element).closest("[data-id]")?.getAttribute("data-id") ?? null;
                  if (id !== hoverId) setHoverId(id);
                }}
                onPointerLeave={() => setHoverId(null)}
              >
                {/* Alternate-day shading instead of grid lines */}
                <g className="text-primary">
                  {days.map((t) =>
                    Math.round(t / DAY) % 2 ? (
                      <rect key={t} x={x(t)} y={0} width={dayPx} height={height} fill="currentColor" opacity={0.035} />
                    ) : null,
                  )}
                </g>
                <line
                  x1={x(Date.now())}
                  x2={x(Date.now())}
                  y1={0}
                  y2={height}
                  className="text-tertiary"
                  stroke="currentColor"
                  strokeDasharray="1 3"
                />

                {/* Lane separators and hour guides */}
                <g className="text-quaternary">
                  {river.lanes.map((lane, laneIndex) => (
                    <g key={lane.key ?? "global"}>
                      {guideHours.map((hour) => {
                        const y = lane.top + minuteY(river, hour * 60);
                        return (
                          <g key={hour}>
                            <line x1={0} x2={width} y1={y} y2={y} stroke="currentColor" opacity={0.28} strokeDasharray="2 4" />
                            {laneIndex === 0 ? (
                              <text x={4} y={y - 3} fontSize={9} fill="currentColor" className="tabular-nums">
                                {hourLabel(hour)}
                              </text>
                            ) : null}
                          </g>
                        );
                      })}
                      <line
                        x1={0}
                        x2={width}
                        y1={lane.top + lane.height - 0.5}
                        y2={lane.top + lane.height - 0.5}
                        stroke="currentColor"
                      />
                    </g>
                  ))}
                </g>

                {/* Wicks: active stretch of each day */}
                <g className="text-tertiary">
                  {[...wicks.entries()].map(([key, wick]) =>
                    wick.x < -10 || wick.x > width + 10 ? null : (
                      <line key={key} x1={wick.x} x2={wick.x} y1={wick.lo} y2={wick.hi} stroke="currentColor" opacity={0.5} />
                    ),
                  )}
                </g>

                {river.items.map((item) => {
                  const lit = isLit(item.id);
                  const selected = item.id === selectedId;
                  const common = {
                    "data-id": item.id,
                    tabIndex: 0,
                    role: "button",
                    "aria-label": item.title,
                    className: "cursor-pointer outline-none transition-opacity duration-150 motion-reduce:transition-none",
                    opacity: lit ? 1 : 0.12,
                    onKeyDown: (event: ReactKeyboardEvent) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(item.id);
                      }
                    },
                  };

                  if (item.kind === "memory") {
                    const segment = item.segments[0];
                    const cx = x(segment.day) + dayPx * MEMORY_AT;
                    if (cx < -10 || cx > width + 10) return null;
                    const y = river.lanes[item.lane].top + minuteY(river, segment.a);
                    return (
                      <g key={item.id} {...common} className={`${common.className} ${selected ? "text-primary" : "text-secondary"}`}>
                        <rect
                          x={cx - 3.5}
                          y={y - 3.5}
                          width={7}
                          height={7}
                          rx={1}
                          transform={`rotate(45 ${cx} ${y})`}
                          fill={item.hollow ? "none" : "currentColor"}
                          stroke={item.hollow ? "currentColor" : "none"}
                          strokeWidth={1.5}
                        />
                        <rect x={cx - 8} y={y - 9} width={16} height={18} fill="transparent" />
                      </g>
                    );
                  }

                  return (
                    <g key={item.id} {...common}>
                      {item.segments.map((segment) => {
                        const rect = segmentRect(segment, item.lane);
                        if (rect.x + rect.w < 0 || rect.x > width) return null;
                        return (
                          <g key={segment.day}>
                            <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={Math.min(3, rect.w / 2)} fill={item.color} />
                            {selected ? (
                              <rect
                                x={rect.x - 2}
                                y={rect.y - 2}
                                width={rect.w + 4}
                                height={rect.h + 4}
                                rx={Math.min(4.5, rect.w / 2 + 2)}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={1.5}
                                className="text-primary"
                              />
                            ) : null}
                            <rect x={rect.x - 2} y={rect.y - 2} width={rect.w + 4} height={rect.h + 4} fill="transparent" />
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
              </svg>
            ) : null}

            {/* Names only for the focused item and what it's related to */}
            {floating.map(({ item, left, top, strong }) => (
              <div
                key={item.id}
                className="pointer-events-none absolute rounded bg-well px-1.5 whitespace-nowrap"
                style={{ left, top }}
              >
                <Text variant={strong ? "small-strong" : "small"}>{item.title}</Text>
              </div>
            ))}
          </div>
        </div>
      </div>

      {library && items.length === 0 ? (
        <EmptyState
          title="Nothing to Show"
          description="Sessions and memories from your agents will appear here as soon as they exist on disk."
        />
      ) : null}

      {items.length > 0 ? (
        <div className="pointer-events-none absolute bottom-3 left-4 flex max-w-[70%] flex-wrap items-center gap-x-4 gap-y-1">
          {HARNESS_ORDER.filter((id) => harnessesPresent.has(id)).map((id) => (
            <LegendEntry key={id} glyph={<HarnessDot harness={id} />} label={HARNESS_STYLES[id].name} />
          ))}
          {hasShared ? <LegendEntry glyph={<HarnessDot color={SHARED_STYLE.color} />} label="Shared" /> : null}
          <LegendEntry glyph={<MemoryGlyph />} label="Memory" />
          {hasGenerated ? <LegendEntry glyph={<MemoryGlyph hollow />} label="Generated" /> : null}
        </div>
      ) : null}

      <div className="absolute right-3 bottom-3 flex items-center gap-1">
        <Button variant="glass" size="small" iconOnly aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(1 / 1.6)}>
          <Minus />
        </Button>
        <Button variant="glass" size="small" iconOnly aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1.6)}>
          <Plus />
        </Button>
        <Button variant="glass" size="small" iconOnly aria-label="Fit timeline" title="Fit timeline" onClick={() => setManualView(null)}>
          <Maximize />
        </Button>
      </div>
    </div>
  );
}
