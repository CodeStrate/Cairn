import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Text } from "@renderer/ui";

import type { ViewMode } from "../../lib/search";
import type { TourStep } from "./tour-steps";

interface TourOverlayProps {
  steps: TourStep[];
  onClose: () => void;
  /** Called when a step needs a particular view (Timeline, Graph, List) on screen. */
  onViewChange?: (view: ViewMode) => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const CARD_WIDTH = 340;
const GAP = 12;
const PAD = 8;
/** Corner radius of the spotlight hole and its glow. */
const RADIUS = 14;
const EDGE = 16;

/**
 * The dim layer's shape: the whole window minus a rounded hole. `path()` takes SVG path
 * syntax, so the hole gets arc corners (`polygon()` only does straight lines); `evenodd`
 * turns the inner shape into a hole. Same command list every time, so it animates.
 */
function spotlightPath(rect: Rect): string {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const x = rect.left;
  const y = rect.top;
  const x2 = rect.left + rect.width;
  const y2 = rect.top + rect.height;
  const r = Math.min(RADIUS, rect.width / 2, rect.height / 2);
  return `path(evenodd, "M0 0 H${w} V${h} H0 Z M${x + r} ${y} H${x2 - r} A${r} ${r} 0 0 1 ${x2} ${y + r} V${y2 - r} A${r} ${r} 0 0 1 ${x2 - r} ${y2} H${x + r} A${r} ${r} 0 0 1 ${x} ${y2 - r} V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z")`;
}

function measure(target: string | undefined): Rect | null {
  if (!target) return null;
  const element = document.querySelector(`[data-tour="${target}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return {
    top: rect.top - PAD,
    left: rect.left - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
  };
}

/** Card beside the spotlight: below, above, right, or left — whichever fits first. */
function cardPosition(rect: Rect | null, cardHeight: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!rect) return { left: (vw - CARD_WIDTH) / 2, top: Math.max(EDGE, (vh - cardHeight) / 2) };

  const clampX = (x: number) => Math.min(Math.max(EDGE, x), vw - CARD_WIDTH - EDGE);
  const clampY = (y: number) => Math.min(Math.max(EDGE, y), vh - cardHeight - EDGE);
  const below = rect.top + rect.height + GAP;
  if (below + cardHeight <= vh - EDGE) return { left: clampX(rect.left), top: below };
  const above = rect.top - GAP - cardHeight;
  if (above >= EDGE) return { left: clampX(rect.left), top: above };
  const right = rect.left + rect.width + GAP;
  if (right + CARD_WIDTH <= vw - EDGE) return { left: right, top: clampY(rect.top) };
  const left = rect.left - GAP - CARD_WIDTH;
  if (left >= EDGE) return { left, top: clampY(rect.top) };
  // Target fills the screen (e.g. the main pane): float over its centre.
  return {
    left: clampX(rect.left + rect.width / 2 - CARD_WIDTH / 2),
    top: clampY(rect.top + rect.height / 2 - cardHeight / 2),
  };
}

/**
 * Spotlight tour: dims the window except the current step's target and shows a card next
 * to it. Arrow keys move between steps; Escape ends the tour.
 */
export function TourOverlay({ steps, onClose, onViewChange }: TourOverlayProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState(180);
  const step = steps[index];
  const last = index === steps.length - 1;

  // Switch to the step's view; the re-measure below then finds the new layout.
  // Deps are only the view on purpose: onViewChange is a new function every render.
  useEffect(() => {
    if (step.currentviewMode) onViewChange?.(step.currentviewMode);
  }, [step.currentviewMode]);

  // Re-measure on step change and while the layout settles or the window resizes.
  useEffect(() => {
    let frame = 0;
    const update = () => setRect(measure(step.target));
    update();
    const settle = window.setInterval(update, 250);
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.clearInterval(settle);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(frame);
    };
  }, [step.target]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight" || event.key === "Enter") {
        if (last) onClose();
        else setIndex((current) => current + 1);
      } else if (event.key === "ArrowLeft") setIndex((current) => Math.max(0, current - 1));
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [last, onClose]);

  const position = cardPosition(rect, cardHeight);

  return createPortal(
    <div className="fixed inset-0 z-9000" role="dialog" aria-modal="true" aria-label="Wefty tour">
      {/* Dim and blur everything except the spotlight (a rounded hole cut with clip-path). */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[5px] transition-[clip-path] duration-200
        motion-reduce:transition-none"
        style={
          rect
            ? {
                clipPath: spotlightPath(rect),
              }
            : undefined
        }
      />
      {rect ? (
        <div
          className="pointer-events-none absolute transition-all duration-200 motion-reduce:transition-none"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            borderRadius: RADIUS,
            // A soft glow instead of a hard outline: a faint edge plus a wide, dim halo.
            boxShadow:
              "0 0 0 1.5px rgba(255, 255, 255, 0.45), 0 0 28px 6px rgba(255, 255, 255, 0.14)",
          }}
        />
      ) : null}

      <div
        ref={(element) => {
          if (element && Math.abs(element.offsetHeight - cardHeight) > 1)
            setCardHeight(element.offsetHeight);
        }}
        // The card can sit over the un-blurred spotlight (e.g. the whole main pane), and the
        // popover surface is translucent glass, so it needs its own blur to stay readable.
        className="absolute flex flex-col gap-3 rounded-xl border border-separator bg-surface-popover p-4 shadow-xl backdrop-blur-2xl backdrop-saturate-150 transition-all duration-200 motion-reduce:transition-none"
        style={{ width: CARD_WIDTH, left: position.left, top: position.top }}
      >
        <Text variant="small" color="tertiary" className="tabular-nums">
          {index + 1} of {steps.length}
        </Text>
        <Text variant="large-strong">{step.title}</Text>
        <Text color="secondary">{step.body}</Text>
        <div className="mt-1 flex items-center gap-2">
          <Button variant="transparent" size="small" onClick={onClose}>
            {last ? "Close" : "Skip tour"}
          </Button>
          <div className="flex-1" />
          {index > 0 ? (
            <Button size="small" onClick={() => setIndex(index - 1)}>
              Back
            </Button>
          ) : null}
          <Button
            size="small"
            variant="accent"
            autoFocus
            onClick={() => (last ? onClose() : setIndex(index + 1))}
          >
            {last ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
