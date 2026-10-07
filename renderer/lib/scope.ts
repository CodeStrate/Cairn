import type { HarnessId, LibraryItem, LibrarySnapshot } from "@main/shared/types";

import { baseName } from "./format";
import { HARNESS_STYLES, isHarnessId } from "./harness";

export type Scope =
  | { kind: "all" }
  | { kind: "sessions" }
  | { kind: "memories" }
  | { kind: "harness"; harness: HarnessId }
  | { kind: "project"; path: string };

export function parseScope(value: string): Scope {
  if (value === "sessions" || value === "memories") return { kind: value };
  if (value.startsWith("harness:")) {
    const harness = value.slice("harness:".length);
    if (isHarnessId(harness)) return { kind: "harness", harness };
  }
  if (value.startsWith("project:")) return { kind: "project", path: value.slice("project:".length) };
  return { kind: "all" };
}

export function projectScope(projectPath: string): string {
  return `project:${projectPath}`;
}

function inScope(item: LibraryItem, scope: Scope): boolean {
  switch (scope.kind) {
    case "all":
      return true;
    case "sessions":
      return item.kind === "session";
    case "memories":
      return item.kind === "memory";
    case "harness":
      return item.kind === "session" ? item.harness === scope.harness : item.harnesses.includes(scope.harness);
    case "project":
      return item.cwd === scope.path;
  }
}

export function scopedItems(library: LibrarySnapshot, scope: Scope): LibraryItem[] {
  const items: LibraryItem[] = [...library.sessions, ...library.memories];
  return items.filter((item) => inScope(item, scope)).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function scopeTitle(scope: Scope, library: LibrarySnapshot | undefined): string {
  switch (scope.kind) {
    case "all":
      return "Everything";
    case "sessions":
      return "Sessions";
    case "memories":
      return "Memories";
    case "harness":
      return HARNESS_STYLES[scope.harness].name;
    case "project":
      return library?.projects.find((project) => project.path === scope.path)?.name ?? baseName(scope.path);
  }
}

export function itemSearchText(item: LibraryItem): string {
  const parts =
    item.kind === "session"
      ? [item.title, item.firstPrompt, item.cwd ?? "", item.gitBranch ?? ""]
      : [item.title, item.description, item.path];
  return parts.join(" ").toLowerCase();
}

export function matchesQuery(item: LibraryItem, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = itemSearchText(item);
  return terms.every((term) => text.includes(term));
}

export function findItem(library: LibrarySnapshot, id: string): LibraryItem | null {
  return (
    library.sessions.find((session) => session.id === id) ??
    library.memories.find((memory) => memory.id === id) ??
    null
  );
}

export function projectLabel(cwd: string | null, library: LibrarySnapshot): string {
  if (!cwd) return "Global";
  return library.projects.find((project) => project.path === cwd)?.name ?? baseName(cwd);
}
