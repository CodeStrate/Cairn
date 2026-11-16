import {
  useEffect,
  useMemo,
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
import { buildRiver, packLane, type RiverData, type RiverItem } from "../lib/river-data";
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
// Zoom is bounded by day width: zoomed out, a day never gets narrower than this.
const MIN_DAY_PX = 48;
const MAX_DAY_PX = 4800;
const FIT_DAY_PX = 160;
const MIN_K = MIN_DAY_PX / DAY;
const MAX_K = MAX_DAY_PX / DAY;

const ROW_H = 22;
const BAR_H = 12;
const LANE_PAD = 10;
const MIN_BAR_PX = 8;
const DIAMOND = 9;
const LABEL_GAP = 6;
const LABEL_TRAIL = 14;
const MAX_LABEL_PX = 240;
const LABEL_FONT_SIZE = 11;
const LABEL_FONT = `${LABEL_FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`;

let measureContext: CanvasRenderingContext2D | null = null;

function measure(text: string): number {
  measureContext ??= document.createElement("canvas").getContext("2d");
  if (!measureContext) return text.length * 6.2;
  measureContext.font = LABEL_FONT;
  return measureContext.measureText(text).width;
}

/** Title cut to fit `MAX_LABEL_PX`, with its measured width. */
function fitLabel(title: string): { text: string; width: number } {
  const full = measure(title);
  if (full <= MAX_LABEL_PX) return { text: title, width: full };
  let lo = 0;
  let hi = title.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(`${title.slice(0, mid)}…`) <= MAX_LABEL_PX) lo = mid;
    else hi = mid - 1;
  }
  const text = `${title.slice(0, lo).trimEnd()}…`;
  return { text, width: measure(text) };
}

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function clampK(k: number) {
  return Math.min(Math.max(k, MIN_K), MAX_K);
}

/** Newest activity on the right at a readable day width; short histories start at the left. */
function fitViewport(river: RiverData, width: number): Viewport {
  const first = startOfDay(river.minTime);
  const last = startOfDay(river.maxTime) + DAY;
  const days = Math.max(1, (last - first) / DAY);
  const k = clampK(Math.min(width / days, FIT_DAY_PX) / DAY);
  return { t0: days * k * DAY <= width ? first : last - width / k, k };
}

/** Keep the window on the data (plus slack) so panning can't lose the timeline. */
function clampView(view: Viewport, river: RiverData, width: number): Viewport {
  const k = clampK(view.k);
  const lo = startOfDay(river.minTime) - 2 * DAY;
  const hi = startOfDay(river.maxTime) + 3 * DAY - width / k;
  return { t0: Math.min(Math.max(view.t0, lo), Math.max(lo, hi)), k };
}

/** Midnights inside the window. */
function visibleDays(view: Viewport, width: number): number[] {
  const end = view.t0 + width / view.k;
  const days: number[] = [];
  for (let t = startOfDay(view.t0); t < end && days.length < 800; ) {
    days.push(t);
    const next = new Date(t);
    next.setDate(next.getDate() + 1); // DST-safe
    t = next.getTime();
  }
  return days;
}

const dayShort = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const dayLong = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

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

export function RiverPane({
  toolbar,
  library,
  items,
  query,
  selectedId,
  onSelect,
  onOpenProject,
}: RiverPaneProps) {
  const river = useMemo(() => (library ? buildRiver(items, library) : null), [items, library]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // null = "fit"; becomes explicit as soon as the user pans or zooms.
  const [manualView, setManualView] = useState<Viewport | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const dragRef = useRef<{
    x: number;
    t0: number;
    k: number;
    moved: boolean;
    id: string | null;
  } | null>(null);

  const view = manualView ?? (river ? fitViewport(river, width) : { t0: 0, k: 1 });
  // The wheel listener is bound once, so it reads the latest values through refs.
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
      let next: Viewport | null = null;
      if (event.ctrlKey || event.metaKey) {
        const t = current.t0 + px / current.k;
        const k = clampK(current.k * Math.exp(-event.deltaY * 0.01));
        next = { t0: t - px / k, k };
      } else if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        next = { t0: current.t0 + event.deltaX / current.k, k: current.k };
      }
      if (!next) return;
      event.preventDefault();
      setManualView(clampView(next, data, widthRef.current));
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

  // Labels are measured once per data change.
  const labels = useMemo(() => {
    const map = new Map<string, { text: string; width: number }>();
    for (const item of river?.items ?? []) map.set(item.id, fitLabel(item.title));
    return map;
  }, [river]);

  // Rows are packed at a quantised zoom so items don't hop rows on every wheel tick.
  const packK = Math.pow(2, Math.round(Math.log2(view.k) * 2) / 2);
  const layout = useMemo(() => {
    if (!river) return null;
    let top = 0;
    const lanes = river.byLane.map((laneItems) => {
      const { rows, rowCount } = packLane(laneItems, (item) => {
        const left = item.start * packK;
        const glyphEnd =
          item.kind === "session"
            ? Math.max(item.end * packK, left + MIN_BAR_PX)
            : left + DIAMOND / 2;
        const labelWidth = labels.get(item.id)?.width ?? 0;
        return [
          item.kind === "session" ? left : left - DIAMOND / 2,
          glyphEnd + LABEL_GAP + labelWidth + LABEL_TRAIL,
        ];
      });
      const height = LANE_PAD * 2 + rowCount * ROW_H;
      const lane = { top, height, rows };
      top += height;
      return lane;
    });
    return { lanes, height: top };
  }, [river, packK, labels]);

  const rowY = (item: RiverItem) => {
    const lane = layout!.lanes[item.lane];
    return lane.top + LANE_PAD + (lane.rows.get(item.id) ?? 0) * ROW_H + ROW_H / 2;
  };

  // Search fades non-matches; hover/selection fades everything unrelated.
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches =
    river && terms.length > 0
      ? new Set(
          river.items
            .filter((item) => terms.every((term) => item.searchText.includes(term)))
            .map((item) => item.id),
        )
      : null;
  const focusId = hoverId ?? selectedId;
  const focus = focusId && river?.byId.has(focusId) ? focusId : null;
  const related = focus ? (river?.related.get(focus) ?? new Map()) : null;
  const isLit = (id: string) =>
    (!focus || id === focus || related!.has(id)) && (!matches || matches.has(id));
  const laneLit = (lane: number) =>
    !river ||
    !focus ||
    river.byLane[lane].some((item) => item.id === focus || related!.has(item.id));

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = (event.target as Element).closest("[data-id]");
    dragRef.current = {
      x: event.clientX,
      t0: view.t0,
      k: view.k,
      moved: false,
      id: target?.getAttribute("data-id") ?? null,
    };
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
  const labelEvery = Math.max(1, Math.ceil(80 / dayPx));
  const hourStep = dayPx >= 1600 ? 1 : dayPx >= 800 ? 3 : dayPx >= 400 ? 6 : 0;
  const height = layout?.height ?? 0;
  const now = Date.now();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {toolbar}

      {/* Day axis */}
      <div className="flex shrink-0" style={{ height: AXIS }}>
        <div style={{ width: GUTTER }} className="shrink-0" />
        <div ref={axisRef} className="min-w-0 flex-1 overflow-hidden">
          <svg width={width} height={AXIS} className="block text-tertiary">
            {days.map((t) => (
              <g key={t}>
                {Math.round(t / DAY) % labelEvery ? null : (
                  <text x={x(t) + 6} y={19} fontSize={11} fill="currentColor" className="tabular-nums">
                    {(dayPx > 140 ? dayLong : dayShort).format(t)}
                  </text>
                )}
                {hourStep
                  ? Array.from({ length: 24 / hourStep - 1 }, (_, i) => {
                      const hour = (i + 1) * hourStep;
                      return (
                        <text
                          key={hour}
                          x={x(t + hour * 3_600_000) + 3}
                          y={19}
                          fontSize={10}
                          fill="currentColor"
                          opacity={0.6}
                          className="tabular-nums"
                        >
                          {String(hour).padStart(2, "0")}:00
                        </text>
                      );
                    })
                  : null}
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* Lanes */}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="relative flex" style={{ height }}>
          {/* Project gutter */}
          <div className="relative shrink-0" style={{ width: GUTTER }}>
            {river && layout
              ? river.lanes.map((lane, index) => (
                  <button
                    key={lane.key ?? "global"}
                    type="button"
                    disabled={lane.key === null}
                    onClick={() => lane.key && onOpenProject(lane.key)}
                    className="absolute inset-x-0 flex items-center gap-2 pr-3 pl-4 text-left transition-opacity"
                    style={{
                      top: layout.lanes[index].top + LANE_PAD + 1,
                      height: 20,
                      opacity: laneLit(index) ? 1 : 0.3,
                    }}
                    title={lane.key ?? "Global memories"}
                  >
                    <Text variant="small" className="min-w-0 flex-1 truncate">
                      {lane.name}
                    </Text>
                    <Text variant="small" color="tertiary" className="tabular-nums">
                      {lane.count}
                    </Text>
                  </button>
                ))
              : null}
          </div>

          {/* Timeline */}
          <div
            className="relative min-w-0 flex-1 cursor-grab touch-pan-y overflow-hidden select-none active:cursor-grabbing"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => (dragRef.current = null)}
          >
            {river && layout ? (
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
                {/* Alternate-day shading and hour guides */}
                <g className="text-primary">
                  {days.map((t) =>
                    Math.round(t / DAY) % 2 ? (
                      <rect key={t} x={x(t)} y={0} width={dayPx} height={height} fill="currentColor" opacity={0.035} />
                    ) : null,
                  )}
                </g>
                {hourStep ? (
                  <g className="text-quaternary">
                    {days.flatMap((t) =>
                      Array.from({ length: 24 / hourStep - 1 }, (_, i) => {
                        const hx = x(t + (i + 1) * hourStep * 3_600_000);
                        return (
                          <line key={`${t}:${i}`} x1={hx} x2={hx} y1={0} y2={height} stroke="currentColor" opacity={0.35} strokeDasharray="2 4" />
                        );
                      }),
                    )}
                  </g>
                ) : null}
                <line x1={x(now)} x2={x(now)} y1={0} y2={height} className="text-tertiary" stroke="currentColor" strokeDasharray="1 3" />
                <g className="text-quaternary">
                  {layout.lanes.map((lane, index) => (
                    <line
                      key={index}
                      x1={0}
                      x2={width}
                      y1={lane.top + lane.height - 0.5}
                      y2={lane.top + lane.height - 0.5}
                      stroke="currentColor"
                    />
                  ))}
                </g>

                {river.items.map((item) => {
                  const label = labels.get(item.id)!;
                  const y = rowY(item);
                  const left = x(item.start);
                  const glyphRight =
                    item.kind === "session"
                      ? left + Math.max(x(item.end) - left, MIN_BAR_PX)
                      : left + DIAMOND / 2;
                  const labelX = glyphRight + LABEL_GAP;
                  if (labelX + label.width < 0 || left - DIAMOND > width) return null;

                  const lit = isLit(item.id);
                  const selected = item.id === selectedId;
                  return (
                    <g
                      key={item.id}
                      data-id={item.id}
                      tabIndex={0}
                      role="button"
                      aria-label={item.title}
                      className="cursor-pointer outline-none transition-opacity duration-150 motion-reduce:transition-none"
                      opacity={lit ? 1 : 0.15}
                      onKeyDown={(event: ReactKeyboardEvent) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelect(item.id);
                        }
                      }}
                    >
                      {item.kind === "session" ? (
                        <>
                          <rect x={left} y={y - BAR_H / 2} width={glyphRight - left} height={BAR_H} rx={3} fill={item.color} />
                          {selected ? (
                            <rect
                              x={left - 2.5}
                              y={y - BAR_H / 2 - 2.5}
                              width={glyphRight - left + 5}
                              height={BAR_H + 5}
                              rx={5}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.5}
                              className="text-primary"
                            />
                          ) : null}
                        </>
                      ) : (
                        <rect
                          x={left - DIAMOND / 2 + 1}
                          y={y - DIAMOND / 2 + 1}
                          width={DIAMOND - 2}
                          height={DIAMOND - 2}
                          rx={1}
                          transform={`rotate(45 ${left} ${y})`}
                          fill={item.hollow ? "none" : "currentColor"}
                          stroke="currentColor"
                          strokeWidth={item.hollow || selected ? 1.5 : 0}
                          className={selected ? "text-primary" : "text-secondary"}
                        />
                      )}
                      <text
                        x={labelX}
                        y={y + LABEL_FONT_SIZE * 0.36}
                        fontSize={LABEL_FONT_SIZE}
                        fontWeight={selected ? 600 : 400}
                        fill="currentColor"
                        className={selected || item.id === focus ? "text-primary" : "text-secondary"}
                      >
                        {label.text}
                      </text>
                      {/* Hit area covers glyph and label */}
                      <rect
                        x={left - DIAMOND / 2}
                        y={y - ROW_H / 2}
                        width={labelX + label.width - left + DIAMOND / 2}
                        height={ROW_H}
                        fill="transparent"
                      />
                    </g>
                  );
                })}
              </svg>
            ) : null}
          </div>
        </div>

        {library && items.length === 0 ? (
          <EmptyState
            title="Nothing to Show"
            description="Sessions and memories from your agents will appear here as soon as they exist on disk."
          />
        ) : null}
      </div>

      {/* Footer: legend and zoom live in the layout, not over the lanes */}
      <div className="flex shrink-0 items-center gap-4 border-t border-separator px-4 py-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
          {HARNESS_ORDER.filter((id) => harnessesPresent.has(id)).map((id) => (
            <LegendEntry key={id} glyph={<HarnessDot harness={id} />} label={HARNESS_STYLES[id].name} />
          ))}
          {hasShared ? <LegendEntry glyph={<HarnessDot color={SHARED_STYLE.color} />} label="Shared" /> : null}
          {items.length > 0 ? <LegendEntry glyph={<MemoryGlyph />} label="Memory" /> : null}
          {hasGenerated ? <LegendEntry glyph={<MemoryGlyph hollow />} label="Generated" /> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="transparent" size="small" iconOnly aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(1 / 1.6)}>
            <Minus />
          </Button>
          <Button variant="transparent" size="small" iconOnly aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1.6)}>
            <Plus />
          </Button>
          <Button variant="transparent" size="small" iconOnly aria-label="Fit timeline" title="Fit timeline" onClick={() => setManualView(null)}>
            <Maximize />
          </Button>
        </div>
      </div>
    </div>
  );
}
