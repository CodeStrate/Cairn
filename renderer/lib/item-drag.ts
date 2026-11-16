/**
 * In-app drag for things HTML5 drag-and-drop can't carry: SVG timeline bars and canvas
 * graph nodes. A small label follows the pointer; releasing over an element marked
 * `data-drop-target` dispatches a `wefty:drop-text` CustomEvent on it with the text.
 * Escape cancels.
 */

export const DROP_TEXT_EVENT = "wefty:drop-text";

export interface ItemDragPayload {
  /** What lands in the target, e.g. a quoted path or a resume command. */
  text: string;
  /** Shown next to the pointer while dragging. */
  label: string;
}

let active: (() => void) | null = null;

function targetAt(x: number, y: number): HTMLElement | null {
  const element = document.elementFromPoint(x, y);
  return element instanceof Element ? (element.closest<HTMLElement>("[data-drop-target]") ?? null) : null;
}

export function startItemDrag(payload: ItemDragPayload, start: { clientX: number; clientY: number }): void {
  active?.();

  const ghost = document.createElement("div");
  ghost.textContent = payload.label;
  Object.assign(ghost.style, {
    position: "fixed",
    left: "0",
    top: "0",
    zIndex: "10000",
    pointerEvents: "none",
    maxWidth: "260px",
    padding: "3px 8px",
    borderRadius: "6px",
    font: "12px -apple-system, BlinkMacSystemFont, sans-serif",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    color: "white",
    background: "rgba(40, 40, 40, 0.92)",
    boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(ghost);

  let hovered: HTMLElement | null = null;
  const setHovered = (next: HTMLElement | null) => {
    if (next === hovered) return;
    hovered?.removeAttribute("data-drop-active");
    next?.setAttribute("data-drop-active", "true");
    hovered = next;
  };

  const move = (x: number, y: number) => {
    ghost.style.transform = `translate(${x + 12}px, ${y + 10}px)`;
    setHovered(targetAt(x, y));
  };
  move(start.clientX, start.clientY);

  const previousCursor = document.body.style.cursor;
  document.body.style.cursor = "grabbing";

  const onMove = (event: PointerEvent) => move(event.clientX, event.clientY);
  const onUp = (event: PointerEvent) => {
    const target = targetAt(event.clientX, event.clientY);
    cleanup();
    target?.dispatchEvent(new CustomEvent<string>(DROP_TEXT_EVENT, { detail: payload.text }));
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") cleanup();
  };

  function cleanup() {
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("keydown", onKey, true);
    setHovered(null);
    ghost.remove();
    document.body.style.cursor = previousCursor;
    active = null;
  }

  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("keydown", onKey, true);
  active = cleanup;
}
