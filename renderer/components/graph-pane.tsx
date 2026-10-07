import { useRef, type ReactNode } from "react";
import { Maximize, Minus, Plus } from "lucide-react";
import { Button, EmptyState, Text } from "@glaze/core/components";

import type { HarnessId, LibraryItem, LibrarySnapshot } from "@main/shared/types";

import { buildGraph, type GraphNode } from "../lib/graph-data";
import { HARNESS_ORDER, HARNESS_STYLES, SHARED_STYLE } from "../lib/harness";
import { GraphCanvas, type GraphControls } from "./graph/graph-canvas";
import { HarnessDot } from "./item-visuals";

interface GraphPaneProps {
  toolbar: ReactNode;
  library: LibrarySnapshot | undefined;
  items: LibraryItem[];
  query: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenProject: (projectPath: string) => void;
}

function ShapeGlyph({ shape }: { shape: "circle" | "diamond" | "hollow" }) {
  return (
    <svg viewBox="0 0 10 10" className="size-2.5 shrink-0 text-tertiary" aria-hidden>
      {shape === "circle" ? <circle cx="5" cy="5" r="4" fill="currentColor" /> : null}
      {shape === "diamond" ? <path d="M5 0.5 9.5 5 5 9.5 0.5 5Z" fill="currentColor" /> : null}
      {shape === "hollow" ? (
        <path d="M5 1.2 8.8 5 5 8.8 1.2 5Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      ) : null}
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

export function GraphPane({ toolbar, library, items, query, selectedId, onSelect, onOpenProject }: GraphPaneProps) {
  const controlsRef = useRef<GraphControls | null>(null);
  const graph = library ? buildGraph(items, library) : { nodes: [], links: [] };

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches =
    terms.length > 0
      ? new Set(graph.nodes.filter((node) => terms.every((term) => node.searchText.includes(term))).map((node) => node.id))
      : null;

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

  const handleSelectNode = (node: GraphNode) => {
    if (node.itemId) onSelect(node.itemId);
    else if (node.projectPath) onOpenProject(node.projectPath);
  };

  return (
    <div className="relative h-full overflow-hidden">
      <GraphCanvas
        className="absolute inset-0"
        graph={graph}
        selectedId={selectedId}
        matches={matches}
        onSelectNode={handleSelectNode}
        controlsRef={controlsRef}
      />
      <div className="absolute inset-x-0 top-0">{toolbar}</div>

      {library && items.length === 0 ? (
        <EmptyState
          title="Nothing to Map"
          description="Sessions and memories from your agents will appear here as soon as they exist on disk."
        />
      ) : null}

      {items.length > 0 ? (
        <div className="pointer-events-none absolute bottom-3 left-4 flex max-w-[70%] flex-wrap items-center gap-x-4 gap-y-1">
          {HARNESS_ORDER.filter((id) => harnessesPresent.has(id)).map((id) => (
            <LegendEntry key={id} glyph={<HarnessDot harness={id} />} label={HARNESS_STYLES[id].name} />
          ))}
          {hasShared ? <LegendEntry glyph={<HarnessDot color={SHARED_STYLE.color} />} label="Shared" /> : null}
          <LegendEntry glyph={<ShapeGlyph shape="circle" />} label="Session" />
          <LegendEntry glyph={<ShapeGlyph shape="diamond" />} label="Memory" />
          {hasGenerated ? <LegendEntry glyph={<ShapeGlyph shape="hollow" />} label="Generated" /> : null}
        </div>
      ) : null}

      <div className="absolute right-3 bottom-3 flex items-center gap-1">
        <Button variant="glass" size="small" iconOnly aria-label="Zoom out" title="Zoom out" onClick={() => controlsRef.current?.zoomOut()}>
          <Minus />
        </Button>
        <Button variant="glass" size="small" iconOnly aria-label="Zoom in" title="Zoom in" onClick={() => controlsRef.current?.zoomIn()}>
          <Plus />
        </Button>
        <Button variant="glass" size="small" iconOnly aria-label="Fit graph" title="Fit graph" onClick={() => controlsRef.current?.fit()}>
          <Maximize />
        </Button>
      </div>
    </div>
  );
}
