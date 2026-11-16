export type ViewMode = "river" | "graph" | "list";

const VIEW_MODES: readonly ViewMode[] = ["river", "graph", "list"];

export function isViewMode(value: unknown): value is ViewMode {
  return (VIEW_MODES as readonly unknown[]).includes(value);
}

export interface HomeSearch {
  view: ViewMode;
  /** `all` | `sessions` | `memories` | `harness:<id>` | `project:<path>` */
  scope: string;
  q: string;
  sel?: string;
}

export function validateHomeSearch(search: Record<string, unknown>): HomeSearch {
  return {
    view: isViewMode(search.view) ? search.view : "river",
    scope: typeof search.scope === "string" && search.scope ? search.scope : "all",
    q: typeof search.q === "string" ? search.q : "",
    sel: typeof search.sel === "string" && search.sel ? search.sel : undefined,
  };
}
