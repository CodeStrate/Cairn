import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Text } from "@glaze/core/components";

import type { TourStep } from "./tour-steps";

interface TourOverlayProps {
  steps: TourStep[];
  onClose: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const CARD_WIDTH = 340;
const GAP = 12;
const PAD = 6;
const EDGE = 16;

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
export function TourOverlay({ steps, onClose }: TourOverlayProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState(180);
  const step = steps[index];
  const last = index === steps.length - 1;

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
    <div className="fixed inset-0 z-[9000]" role="dialog" aria-modal="true" aria-label="Wefty tour">
      {/* dim and blur everything except the tour tips using a spotlight via clip path */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[5px] transition-[clip-path] duration-200
        motion-reduce:transition-none"
        style={
          rect ? {
              clipPath: `polygon(evenodd,
              0 0, 100% 0, 100% 100%, 0 100%, 0 0,
              ${rect.left}px ${rect.top}px,
              ${rect.left + rect.width}px ${rect.top}px,
              ${rect.left + rect.width}px ${rect.top + rect.height}px,
              ${rect.left}px ${rect.top + rect.height}px,
              ${rect.left}px ${rect.top}px)`
          } : undefined
        }
        />
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl transition-all duration-200 motion-reduce:transition-none"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            outline: "2px solid rgba(255, 255, 255, 0.7)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/55" />
      )}

      <div
        ref={(element) => {
          if (element && Math.abs(element.offsetHeight - cardHeight) > 1)
            setCardHeight(element.offsetHeight);
        }}
        className="absolute flex flex-col gap-3 rounded-xl bg-surface-popover p-4 shadow-xl transition-all duration-200 motion-reduce:transition-none"
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
