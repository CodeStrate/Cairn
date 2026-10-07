export type ViewMode = "graph" | "list";

export interface HomeSearch {
  view: ViewMode;
  /** `all` | `sessions` | `memories` | `harness:<id>` | `project:<path>` */
  scope: string;
  q: string;
  sel?: string;
}

export function validateHomeSearch(search: Record<string, unknown>): HomeSearch {
  return {
    view: search.view === "list" ? "list" : "graph",
    scope: typeof search.scope === "string" && search.scope ? search.scope : "all",
    q: typeof search.q === "string" ? search.q : "",
    sel: typeof search.sel === "string" && search.sel ? search.sel : undefined,
  };
}
