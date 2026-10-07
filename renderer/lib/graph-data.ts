import type { LibraryItem, LibrarySnapshot, MemorySummary } from "@main/shared/types";

import { itemHarnessStyle } from "./harness";
import { itemSearchText, projectLabel } from "./scope";

export type GraphNodeType = "hub" | "session" | "memory";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  /** Null renders with the neutral hub color. */
  color: string | null;
  hollow: boolean;
  radius: number;
  itemId: string | null;
  projectPath: string | null;
  searchText: string;
}

export interface GraphLink {
  source: string;
  target: string;
  kind: "project" | "reference" | "generated";
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

const GLOBAL_HUB = "hub:global";

/**
 * Projects (and a Global hub) anchor clusters; sessions and memories orbit them.
 * Dashed edges connect memories that link/import each other, sessions that touched
 * a memory file, and generated memories to the session that produced them.
 */
export function buildGraph(items: LibraryItem[], library: LibrarySnapshot): GraphData {
  const nodes = new Map<string, GraphNode>();
  const links: GraphLink[] = [];
  const degree = new Map<string, number>();
  const addLink = (link: GraphLink) => {
    links.push(link);
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
  };

  const ensureHub = (cwd: string | null): string => {
    const id = cwd ? `hub:${cwd}` : GLOBAL_HUB;
    if (!nodes.has(id)) {
      const label = projectLabel(cwd, library);
      nodes.set(id, {
        id,
        type: "hub",
        label,
        color: null,
        hollow: false,
        radius: 6,
        itemId: null,
        projectPath: cwd,
        searchText: `${label} ${cwd ?? ""}`.toLowerCase(),
      });
    }
    return id;
  };

  const memoriesByPath = new Map<string, MemorySummary>();
  for (const item of items) {
    const style = itemHarnessStyle(item);
    nodes.set(item.id, {
      id: item.id,
      type: item.kind,
      label: item.title,
      color: style.color,
      hollow: item.kind === "memory" && item.memoryType === "generated",
      radius: item.kind === "session" ? 4.5 : 4,
      itemId: item.id,
      projectPath: item.cwd,
      searchText: itemSearchText(item),
    });
    if (item.kind === "memory") memoriesByPath.set(item.path, item);
  }

  for (const item of items) {
    addLink({ source: item.id, target: ensureHub(item.cwd), kind: "project" });
    if (item.kind === "memory") {
      for (const target of item.links) {
        if (nodes.has(target)) addLink({ source: item.id, target, kind: "reference" });
      }
      if (item.sessionId && nodes.has(item.sessionId)) {
        addLink({ source: item.id, target: item.sessionId, kind: "generated" });
      }
    } else {
      for (const file of item.filesTouched) {
        const memory = memoriesByPath.get(file);
        if (memory) addLink({ source: item.id, target: memory.id, kind: "reference" });
      }
    }
  }

  for (const node of nodes.values()) {
    if (node.type === "hub") node.radius = 6 + Math.min(9, Math.sqrt(degree.get(node.id) ?? 0) * 1.6);
  }

  return { nodes: [...nodes.values()], links };
}
