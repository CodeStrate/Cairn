import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ChevronRight, PanelLeft, Search, X } from "lucide-react";
import { ToggleGroup } from "radix-ui";

import { Button, cn, Input } from "./primitives";

const isMac = () => typeof window !== "undefined" && window.wefty?.platform === "darwin";

// --- SplitView ----------------------------------------------------------------

interface SplitViewContextValue {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

const SplitViewContext = createContext<SplitViewContextValue | null>(null);

const SIDEBAR_SHORTCUT = () => (isMac() ? "⌃⌘S" : "Ctrl+Alt+S");

/** Show/hide the sidebar. Renders nothing outside a SplitView (e.g. the Settings window). */
export function SidebarToggle() {
  const split = useContext(SplitViewContext);
  if (!split) return null;
  const label = split.sidebarCollapsed ? "Show Sidebar" : "Hide Sidebar";
  return (
    <Button
      variant="transparent"
      iconOnly
      aria-label={label}
      title={`${label} (${SIDEBAR_SHORTCUT()})`}
      onClick={split.toggleSidebar}
    >
      <PanelLeft />
    </Button>
  );
}

interface PaneSize {
  default?: number;
  min?: number;
  max?: number;
}

function readWidth(key: string, fallback: number): number {
  try {
    const stored = Number(window.localStorage.getItem(key));
    return Number.isFinite(stored) && stored > 0 ? stored : fallback;
  } catch {
    return fallback;
  }
}

function saveWidth(key: string, width: number) {
  try {
    window.localStorage.setItem(key, String(Math.round(width)));
  } catch {
    // Storage unavailable: the width just won't be remembered.
  }
}

/** Drag handle on a pane edge. `direction` is +1 when dragging right grows the pane. */
function Resizer({
  side,
  width,
  min,
  max,
  direction,
  onResize,
  onCommit,
}: {
  side: "left" | "right";
  width: number;
  min: number;
  max: number;
  direction: 1 | -1;
  onResize: (width: number) => void;
  onCommit: (width: number) => void;
}) {
  const start = useRef<{ x: number; width: number } | null>(null);
  const last = useRef(width);
  const handleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    start.current = { x: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const next = start.current.width + direction * (event.clientX - start.current.x);
    last.current = Math.min(max, Math.max(min, next));
    onResize(last.current);
  };
  const handleUp = () => {
    if (start.current) onCommit(last.current);
    start.current = null;
  };
  return (
    <div
      aria-hidden
      className={cn(
        "absolute inset-y-0 z-20 w-1.5 cursor-col-resize touch-none",
        side === "right" ? "-right-[3px]" : "-left-[3px]",
      )}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
    />
  );
}

export function SplitView({
  storageKey,
  className,
  sidebar,
  sidebarSize = {},
  primarySize = {},
  inspector,
  inspectorSize = {},
  children,
}: {
  storageKey: string;
  className?: string;
  sidebar?: ReactNode;
  sidebarSize?: PaneSize;
  primarySize?: PaneSize;
  inspector?: ReactNode;
  inspectorSize?: PaneSize;
  children: ReactNode;
}) {
  const sidebarKey = `${storageKey}.sidebar`;
  const inspectorKey = `${storageKey}.inspector`;
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readWidth(sidebarKey, sidebarSize.default ?? 230),
  );
  const [inspectorWidth, setInspectorWidth] = useState(() =>
    readWidth(inspectorKey, inspectorSize.default ?? 420),
  );
  const collapsedKey = `${storageKey}.sidebarCollapsed`;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readWidth(collapsedKey, 0) === 1);
  const toggleSidebar = () => {
    setSidebarCollapsed((collapsed) => {
      saveWidth(collapsedKey, collapsed ? 0 : 1);
      return !collapsed;
    });
  };
  const toggleRef = useRef(toggleSidebar);
  useEffect(() => {
    toggleRef.current = toggleSidebar;
  });

  // ⌃⌘S on macOS (the system convention), Ctrl+Alt+S elsewhere.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const combo = isMac()
        ? event.ctrlKey && event.metaKey && !event.altKey
        : event.ctrlKey && event.altKey && !event.metaKey;
      if (combo && event.key.toLowerCase() === "s") {
        event.preventDefault();
        toggleRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const primaryMin = primarySize.min ?? 360;
  const inspectorMax = Math.max(
    inspectorSize.min ?? 300,
    (typeof window === "undefined" ? 1600 : window.innerWidth) - sidebarWidth - primaryMin,
  );

  return (
    <SplitViewContext.Provider value={{ sidebarCollapsed, toggleSidebar }}>
      <div className={cn("flex h-full min-h-0 w-full bg-window-bg", className)}>
        {sidebar && !sidebarCollapsed ? (
          <aside className="relative h-full shrink-0 p-2 pr-0" style={{ width: sidebarWidth }}>
            <div className="h-full overflow-hidden rounded-xl bg-sidebar-panel">{sidebar}</div>
            <Resizer
              side="right"
              width={sidebarWidth}
              min={sidebarSize.min ?? 180}
              max={sidebarSize.max ?? 360}
              direction={1}
              onResize={setSidebarWidth}
              onCommit={(width) => saveWidth(sidebarKey, width)}
            />
          </aside>
        ) : null}
        <main className="relative h-full min-w-0 flex-1" style={{ minWidth: primaryMin }}>
          {children}
        </main>
        {inspector ? (
          <aside
            className="relative h-full shrink-0 border-l border-separator"
            style={{ width: Math.min(inspectorWidth, inspectorMax) }}
          >
            <Resizer
              side="left"
              width={Math.min(inspectorWidth, inspectorMax)}
              min={inspectorSize.min ?? 300}
              max={inspectorMax}
              direction={-1}
              onResize={setInspectorWidth}
              onCommit={(width) => saveWidth(inspectorKey, width)}
            />
            {inspector}
          </aside>
        ) : null}
        {/*
          The sidebar toggle is a single button pinned to the window, so it never moves when
          the sidebar opens or closes; the sidebar header and toolbar only reserve room for it.
          Rendered last and marked no-drag: Electron's window-drag areas ignore stacking, so
          without this the toolbar/sidebar drag region underneath would swallow its clicks.
        */}
        <div
          className={cn(
            "fixed top-3 z-40 [-webkit-app-region:no-drag]",
            isMac() ? "left-20" : "left-4",
            "[&_[data-variant]]:text-secondary",
          )}
        >
          <SidebarToggle />
        </div>
      </div>
    </SplitViewContext.Provider>
  );
}

// --- Sidebar ------------------------------------------------------------------

export function Sidebar({
  actions,
  footer,
  children,
}: {
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header doubles as the window drag area; on macOS it leaves room for the traffic lights. */}
      <div
        className={cn(
          // A 36px row from the card's 8px inset puts its midline at 26px from the window top:
          // the line of the toolbar, the pinned sidebar toggle, and (on macOS) the traffic
          // lights. The left side is left empty for the traffic lights and the toggle.
          "drag-region flex h-9 shrink-0 items-center justify-end gap-1 px-2",
          "[&_[data-variant=default]]:bg-transparent [&_[data-variant=default]]:text-secondary [&_[data-variant=default]:hover]:bg-control",
        )}
      >
        {actions}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer}
    </div>
  );
}

export function SidebarFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("shrink-0", className)} {...props} />;
}

export function SidebarList({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-3 px-2 pb-3", className)} {...props} />;
}

export function SidebarListGroup({
  title,
  collapsible,
  defaultOpen = true,
  actions,
  children,
}: {
  title: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const expanded = !collapsible || open;
  return (
    <section className="flex flex-col gap-0.5">
      <div className="group/header flex h-7 items-center gap-1 pr-0.5 pl-2">
        {collapsible ? (
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1 text-left text-small text-tertiary outline-none hover:text-secondary"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <span className="truncate">{title}</span>
            <ChevronRight
              aria-hidden
              className={cn(
                "size-3 shrink-0 opacity-0 transition group-hover/header:opacity-100",
                open && "rotate-90",
              )}
            />
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate text-small text-tertiary">{title}</span>
        )}
        {actions}
      </div>
      {expanded ? <div className="flex flex-col gap-px">{children}</div> : null}
    </section>
  );
}

export function SidebarListItem({
  icon,
  title,
  subtitle,
  accessory,
  selected,
  className,
  ...props
}: Omit<ComponentProps<"button">, "title"> & {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  accessory?: ReactNode;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex min-h-[30px] w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-1 text-left outline-none",
        "hover:bg-control-subtle focus-visible:ring-2 focus-visible:ring-accent/50",
        selected && "bg-selection hover:bg-selection",
        "[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-secondary",
        className,
      )}
      {...props}
    >
      {icon}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-regular text-primary">{title}</span>
        {subtitle ? <span className="truncate text-small text-tertiary">{subtitle}</span> : null}
      </span>
      {accessory !== undefined && accessory !== null ? (
        <span className="shrink-0 text-small text-quaternary tabular-nums">{accessory}</span>
      ) : null}
    </button>
  );
}

// --- Toolbar ------------------------------------------------------------------

export function Toolbar({
  className,
  leadingInset,
  ...props
}: ComponentProps<"div"> & {
  /** Leave room for the macOS traffic lights (a toolbar at the window's top-left). */
  leadingInset?: boolean;
}) {
  const split = useContext(SplitViewContext);
  const sidebarHidden = split?.sidebarCollapsed ?? false;
  return (
    <div
      data-toolbar
      className={cn(
        "drag-region flex h-13 shrink-0 items-center gap-3 px-4",
        // Clear the traffic lights (macOS) and, with the sidebar hidden, the pinned toggle.
        sidebarHidden && (isMac() ? "pl-[120px]" : "pl-14"),
        // Traffic lights end ~72px; leave a comfortable 20px gap before the title.
        !sidebarHidden && leadingInset && isMac() && "pl-[92px]",
        className,
      )}
      {...props}
    />
  );
}

export function ToolbarContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex min-w-0 flex-1 flex-col", className)} {...props} />;
}

export function ToolbarTitle({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("truncate text-[17px] leading-[22px] font-semibold text-primary", className)}
      {...props}
    />
  );
}

export function ToolbarDescription({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("truncate text-regular text-secondary", className)} {...props} />;
}

export function ToolbarActions({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex shrink-0 items-center gap-1.5", className)} {...props} />;
}

/** Search icon that expands into a field (also opened with ⌘F / Ctrl+F). */
export function ToolbarSearchButton({
  value,
  onChange,
  size = "medium",
  placeholder = "Search",
}: {
  value: string;
  onChange: (value: string) => void;
  size?: "small" | "medium" | "large";
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const expanded = open || value.length > 0;

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.select());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!expanded) {
    return (
      <Button
        variant="glass"
        size={size}
        iconOnly
        aria-label="Search"
        title={`Search (${isMac() ? "⌘" : "Ctrl+"}F)`}
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        <Search />
      </Button>
    );
  }

  return (
    <div className="relative flex items-center">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-2.5 size-3.5 text-tertiary"
      />
      <Input
        ref={inputRef}
        autoFocus
        size={size}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-56 rounded-full pr-7 pl-8"
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          if (!value) setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onChange("");
            setOpen(false);
            event.currentTarget.blur();
          }
        }}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          className="absolute right-2 rounded-full p-0.5 text-tertiary hover:text-primary"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

export function SegmentedControl({
  value,
  onValueChange,
  size = "medium",
  className,
  children,
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  variant?: "glass" | "default";
  size?: "small" | "medium" | "large";
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      aria-label={ariaLabel}
      // Radix reports "" when the active item is clicked again; keep the current view.
      onValueChange={(next) => {
        if (next) onValueChange(next);
      }}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full bg-control p-0.5",
        size === "large" ? "h-8" : size === "small" ? "h-6" : "h-7",
        className,
      )}
    >
      {children}
    </ToggleGroup.Root>
  );
}

export function SegmentedControlItem({
  className,
  iconOnly: _iconOnly,
  ...props
}: ComponentProps<typeof ToggleGroup.Item> & { iconOnly?: boolean }) {
  return (
    <ToggleGroup.Item
      className={cn(
        "inline-flex h-full aspect-square items-center justify-center rounded-full text-secondary outline-none",
        "hover:text-primary focus-visible:ring-2 focus-visible:ring-accent/50",
        "data-[state=on]:bg-window-bg data-[state=on]:text-primary data-[state=on]:shadow-sm",
        "[&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

// --- ScrollArea ---------------------------------------------------------------

export function ScrollArea({
  toolbar,
  actions,
  className,
  children,
}: {
  toolbar?: ReactNode;
  /** Buttons for a slim header bar (used by the inspector). */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {toolbar}
      {actions ? (
        <div
          className={cn(
            "drag-region flex h-13 shrink-0 items-center justify-end gap-1 px-3",
            "[&_[data-variant=default]]:bg-transparent [&_[data-variant=default]]:text-secondary [&_[data-variant=default]:hover]:bg-control [&_[data-variant=default]:hover]:text-primary",
          )}
        >
          {actions}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

// --- List ---------------------------------------------------------------------

interface ListContextValue {
  selectedKey: string | null;
  select: (item: unknown) => void;
  keyOf: (item: unknown) => string;
}

const ListContext = createContext<ListContextValue | null>(null);

function useList(): ListContextValue {
  const value = useContext(ListContext);
  if (!value) throw new Error("List parts must be inside <List.Root>");
  return value;
}

function ListRoot<T>({
  items,
  getItemKey,
  selectedItem,
  onSelectedItemChange,
  children,
}: {
  items: T[];
  getItemKey: (item: T) => string;
  selectedItem: T | null;
  onSelectedItemChange: (item: T | null) => void;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedKey = selectedItem ? getItemKey(selectedItem) : null;

  // ↑/↓ move the selection and keep it in view.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (items.length === 0) return;
    event.preventDefault();
    const index = selectedKey ? items.findIndex((item) => getItemKey(item) === selectedKey) : -1;
    const nextIndex =
      event.key === "ArrowDown" ? Math.min(items.length - 1, index + 1) : Math.max(0, index - 1);
    const next = items[nextIndex];
    onSelectedItemChange(next);
    rootRef.current
      ?.querySelector(`[data-list-key="${CSS.escape(getItemKey(next))}"]`)
      ?.scrollIntoView({ block: "nearest" });
  };

  return (
    <ListContext.Provider
      value={{
        selectedKey,
        select: (item) => onSelectedItemChange(item as T),
        keyOf: (item) => getItemKey(item as T),
      }}
    >
      <div
        ref={rootRef}
        role="listbox"
        tabIndex={0}
        className="flex flex-col gap-1 outline-none"
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </ListContext.Provider>
  );
}

function ListSection({ className, ...props }: ComponentProps<"div">) {
  return <div role="group" className={cn("flex flex-col gap-0.5", className)} {...props} />;
}

function ListSectionTitle({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("px-3 pt-3 pb-1 text-small font-semibold text-secondary", className)}
      {...props}
    />
  );
}

function ListItem({
  item,
  className,
  onClick,
  ...props
}: ComponentProps<"div"> & { item: unknown }) {
  const list = useList();
  const key = list.keyOf(item);
  const selected = list.selectedKey === key;
  return (
    <div
      role="option"
      aria-selected={selected}
      data-list-key={key}
      className={cn(
        "flex min-w-0 cursor-default items-center gap-3 rounded-lg px-3 py-2",
        "hover:bg-control-subtle",
        selected && "bg-selection hover:bg-selection",
        className,
      )}
      onClick={(event) => {
        list.select(item);
        onClick?.(event);
      }}
      {...props}
    />
  );
}

function ListItemIcon({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn("flex shrink-0 items-center text-secondary [&_svg]:size-[18px]", className)}
      {...props}
    />
  );
}

function ListItemContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex min-w-0 flex-1 flex-col", className)} {...props} />;
}

function ListItemTitle({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn("truncate text-[14px] leading-5 font-semibold text-primary", className)}
      {...props}
    />
  );
}

function ListItemDescription({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("truncate text-regular text-secondary", className)} {...props} />;
}

function ListItemAccessory({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("flex shrink-0 items-center", className)} {...props} />;
}

export const List = {
  Root: ListRoot,
  Section: ListSection,
  SectionTitle: ListSectionTitle,
  Item: ListItem,
  ItemIcon: ListItemIcon,
  ItemContent: ListItemContent,
  ItemTitle: ListItemTitle,
  ItemDescription: ListItemDescription,
  ItemAccessory: ListItemAccessory,
};
