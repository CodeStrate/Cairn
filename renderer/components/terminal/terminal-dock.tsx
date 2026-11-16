import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Plus, X } from "lucide-react";
import { Button, Text } from "@glaze/core/components";

import { DROP_TEXT_EVENT } from "../../lib/item-drag";
import { shellQuote } from "../../lib/resume";
import { useTerminals } from "../../lib/terminal-context";
import { TerminalView } from "./terminal-view";

const MIN_WIDTH = 320;
const DEFAULT_WIDTH = 520;
/** Matches the primary toolbar height so the panel lines up with it. */
const HEADER = 52;

/**
 * Right-side terminal panel. Tabs stay mounted while hidden so scrollback survives
 * switching tabs or closing the panel. Whatever is dropped on it is typed at the prompt
 * without pressing Enter: list rows and timeline/graph items (a path or a resume
 * command), and files from Finder (their quoted paths).
 */
export function TerminalDock() {
  const { tabs, activeId, open, openTerminal, insertText, closeTab, setActive, setOpen } =
    useTerminals();
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dropping, setDropping] = useState(false);
  const resizeRef = useRef<{ x: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const insertRef = useRef(insertText);
  useEffect(() => {
    insertRef.current = insertText;
  });

  // Timeline bars and graph nodes arrive through the in-app item drag (see item-drag.ts).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onDropText = (event: Event) => {
      const text = (event as CustomEvent<string>).detail;
      if (text) void insertRef.current(text);
    };
    root.addEventListener(DROP_TEXT_EVENT, onDropText);
    return () => root.removeEventListener(DROP_TEXT_EVENT, onDropText);
  }, [tabs.length > 0]);

  if (tabs.length === 0) return null;

  const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    resizeRef.current = { x: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = resizeRef.current;
    if (!start) return;
    const max = Math.max(MIN_WIDTH, window.innerWidth - 420);
    setWidth(Math.min(max, Math.max(MIN_WIDTH, start.width + (start.x - event.clientX))));
  };

  const accepts = (event: DragEvent) =>
    event.dataTransfer.types.includes("Files") || event.dataTransfer.types.includes("text/plain");
  // This zone owns its drops; the window-level Finder import skips drags over it.
  const handleDragOver = (event: DragEvent) => {
    if (!accepts(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropping(true);
  };
  const handleDrop = (event: DragEvent) => {
    if (!accepts(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setDropping(false);
    const paths = [...event.dataTransfer.files]
      .map((file) => window.glazeAPI.webUtils.getPathForFile(file))
      .filter(Boolean);
    const text =
      paths.length > 0 ? paths.map(shellQuote).join(" ") : event.dataTransfer.getData("text/plain");
    if (text) void insertText(text);
  };

  return (
    <div
      ref={rootRef}
      data-drop-target="terminal"
      className={`group relative flex h-full shrink-0 flex-col border-l border-separator bg-window-bg ${
        open ? "" : "hidden"
      }`}
      style={{ width }}
      onDragOver={handleDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={handleDrop}
    >
      <div
        className="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none"
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={() => (resizeRef.current = null)}
        aria-hidden
      />

      <div className="flex shrink-0 items-end gap-1 px-2 pb-1.5" style={{ height: HEADER }}>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`flex shrink-0 items-center gap-1 rounded-md pr-1 pl-2 ${
                tab.id === activeId ? "bg-surface-control" : ""
              }`}
            >
              <button
                type="button"
                className="max-w-40 truncate py-1 text-left"
                title={tab.cwd}
                onClick={() => setActive(tab.id)}
              >
                <Text variant="small" color={tab.id === activeId ? "primary" : "secondary"}>
                  {tab.title}
                  {tab.exited ? " (exited)" : ""}
                </Text>
              </button>
              <button
                type="button"
                aria-label={`Close ${tab.title}`}
                title="Close"
                className="rounded p-0.5 opacity-60 hover:opacity-100"
                onClick={() => closeTab(tab.id)}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
        <Button
          variant="transparent"
          size="small"
          iconOnly
          aria-label="New terminal"
          title="New terminal"
          onClick={() => void openTerminal()}
        >
          <Plus />
        </Button>
        <Button
          variant="transparent"
          size="small"
          iconOnly
          aria-label="Hide terminal"
          title="Hide terminal"
          onClick={() => setOpen(false)}
        >
          <X />
        </Button>
      </div>

      <div className="relative min-h-0 flex-1 border-t border-separator">
        {tabs.map((tab) => (
          <TerminalView key={tab.id} id={tab.id} visible={open && tab.id === activeId} />
        ))}
        <div
          className={`pointer-events-none absolute inset-1 z-10 rounded-lg border-2 border-dashed border-accent ${
            dropping ? "" : "hidden group-data-[drop-active=true]:block"
          }`}
        />
      </div>
    </div>
  );
}
