import { useEffect, useRef, type MutableRefObject } from "react";
import { cn } from "@glaze/core/utils";

import type { GraphData, GraphNode } from "../../lib/graph-data";
import { GraphEngine, type GraphPalette } from "./graph-engine";

export interface GraphControls {
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
}

/** Resolves semantic text/separator colors so the canvas follows the app theme. */
function readPalette(container: HTMLElement): GraphPalette {
  const probe = (className: string): string => {
    const element = document.createElement("span");
    element.className = className;
    element.style.position = "absolute";
    element.style.visibility = "hidden";
    container.appendChild(element);
    const color = getComputedStyle(element).color;
    element.remove();
    return color;
  };
  return {
    label: probe("text-primary"),
    labelMuted: probe("text-secondary"),
    hub: probe("text-tertiary"),
    edge: probe("text-quaternary"),
    edgeHighlight: probe("text-secondary"),
    ring: probe("text-primary"),
  };
}

interface GraphCanvasProps {
  graph: GraphData;
  selectedId: string | null;
  matches: Set<string> | null;
  onSelectNode: (node: GraphNode) => void;
  controlsRef: MutableRefObject<GraphControls | null>;
  className?: string;
}

export function GraphCanvas({ graph, selectedId, matches, onSelectNode, controlsRef, className }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GraphEngine | null>(null);
  const onSelectRef = useRef(onSelectNode);

  useEffect(() => {
    onSelectRef.current = onSelectNode;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const engine = new GraphEngine(canvas, container, readPalette(container), (node) => onSelectRef.current(node));
    engineRef.current = engine;
    controlsRef.current = engine;

    const refreshPalette = () => engine.setPalette(readPalette(container));
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", refreshPalette);
    const observer = new MutationObserver(refreshPalette);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });

    return () => {
      media.removeEventListener("change", refreshPalette);
      observer.disconnect();
      engine.destroy();
      engineRef.current = null;
      controlsRef.current = null;
    };
  }, [controlsRef]);

  useEffect(() => {
    engineRef.current?.setData(graph.nodes, graph.links);
  }, [graph]);

  useEffect(() => {
    engineRef.current?.setSelected(selectedId);
  }, [selectedId]);

  useEffect(() => {
    engineRef.current?.setMatches(matches);
  }, [matches]);

  return (
    <div ref={containerRef} className={cn("overflow-hidden", className)}>
      <canvas ref={canvasRef} className="absolute inset-0 touch-none" aria-label="Context graph" role="img" />
    </div>
  );
}
