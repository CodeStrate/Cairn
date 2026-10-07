import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type ForceLink,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

import type { GraphLink, GraphNode, GraphNodeType } from "../../lib/graph-data";

export interface GraphPalette {
  label: string;
  labelMuted: string;
  hub: string;
  edge: string;
  edgeHighlight: string;
  ring: string;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  data: GraphNode;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  kind: GraphLink["kind"];
}

type DragState =
  | { mode: "node"; node: SimNode; startX: number; startY: number; moved: boolean }
  | { mode: "pan"; startX: number; startY: number; originX: number; originY: number; moved: boolean };

interface Point {
  x: number;
  y: number;
}

/** WebKit trackpad pinch events (not in the standard DOM typings). */
interface GestureEventLike extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

const TOOLBAR_INSET = 52;
const BOTTOM_INSET = 40;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 4;
const LABEL_ZOOM = 1.5;
const DRAG_THRESHOLD = 3;
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function truncateLabel(label: string): string {
  return label.length > 36 ? `${label.slice(0, 35)}…` : label;
}

/** Canvas force-directed graph with pan, zoom, hover focus, and node dragging. */
export class GraphEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly container: HTMLElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly onSelect: (node: GraphNode) => void;
  private palette: GraphPalette;

  private nodes: SimNode[] = [];
  private links: SimLink[] = [];
  private nodeById = new Map<string, SimNode>();
  private neighbors = new Map<string, Set<string>>();
  private signature = "";

  private readonly simulation: Simulation<SimNode, SimLink>;
  private readonly linkForce: ForceLink<SimNode, SimLink>;
  private readonly resizeObserver: ResizeObserver;

  private transform = { k: 1, x: 0, y: 0 };
  private width = 0;
  private height = 0;
  private dpr = 1;
  private sized = false;
  private needsFit = true;
  private frame = 0;
  private gestureScale = 1;

  private hoverId: string | null = null;
  private selectedId: string | null = null;
  private matches: Set<string> | null = null;
  private drag: DragState | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    container: HTMLElement,
    palette: GraphPalette,
    onSelect: (node: GraphNode) => void,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    this.canvas = canvas;
    this.container = container;
    this.ctx = ctx;
    this.palette = palette;
    this.onSelect = onSelect;

    this.linkForce = forceLink<SimNode, SimLink>([])
      .id((node) => node.id)
      .distance((link) => (link.kind === "project" ? 46 : 72))
      .strength((link) => (link.kind === "project" ? 0.7 : 0.2));
    this.simulation = forceSimulation<SimNode, SimLink>([])
      .force("link", this.linkForce)
      .force(
        "charge",
        forceManyBody<SimNode>()
          .strength((node) => (node.data.type === "hub" ? -340 : -70))
          .distanceMax(600),
      )
      .force(
        "collide",
        forceCollide<SimNode>((node) => node.data.radius + 4),
      )
      .force("x", forceX<SimNode>(0).strength(0.04))
      .force("y", forceY<SimNode>(0).strength(0.04))
      .alphaDecay(0.028)
      .on("tick", this.handleTick);

    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerup", this.handlePointerUp);
    canvas.addEventListener("pointercancel", this.handlePointerUp);
    canvas.addEventListener("pointerleave", this.handlePointerLeave);
    canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    canvas.addEventListener("gesturestart", this.handleGestureStart);
    canvas.addEventListener("gesturechange", this.handleGestureChange);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  destroy(): void {
    this.simulation.stop();
    this.simulation.on("tick", null);
    this.resizeObserver.disconnect();
    cancelAnimationFrame(this.frame);
    const { canvas } = this;
    canvas.removeEventListener("pointerdown", this.handlePointerDown);
    canvas.removeEventListener("pointermove", this.handlePointerMove);
    canvas.removeEventListener("pointerup", this.handlePointerUp);
    canvas.removeEventListener("pointercancel", this.handlePointerUp);
    canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    canvas.removeEventListener("wheel", this.handleWheel);
    canvas.removeEventListener("gesturestart", this.handleGestureStart);
    canvas.removeEventListener("gesturechange", this.handleGestureChange);
  }

  setData(nodes: GraphNode[], links: GraphLink[]): void {
    const signature = `${nodes.map((node) => node.id).join("|")}#${links
      .map((link) => `${link.source}>${link.target}`)
      .join("|")}`;
    if (signature === this.signature) {
      for (const node of nodes) {
        const existing = this.nodeById.get(node.id);
        if (existing) existing.data = node;
      }
      this.schedule();
      return;
    }
    this.signature = signature;

    const previous = this.nodeById;
    let kept = 0;
    this.nodes = nodes.map((data) => {
      const existing = previous.get(data.id);
      if (existing) {
        kept++;
        existing.data = data;
        return existing;
      }
      return { id: data.id, data };
    });
    this.nodeById = new Map(this.nodes.map((node) => [node.id, node]));

    this.links = [];
    this.neighbors = new Map();
    for (const link of links) {
      const source = this.nodeById.get(link.source);
      const target = this.nodeById.get(link.target);
      if (!source || !target) continue;
      // Seed new nodes beside an already-placed neighbor so updates don't scatter the layout.
      this.seedNear(source, target);
      this.seedNear(target, source);
      this.links.push({ source: link.source, target: link.target, kind: link.kind });
      this.neighborSet(link.source).add(link.target);
      this.neighborSet(link.target).add(link.source);
    }

    if (kept < nodes.length * 0.7) this.needsFit = true;
    this.simulation.nodes(this.nodes);
    this.linkForce.links(this.links);
    this.simulation.alpha(kept > 0 ? 0.5 : 1).restart();
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
    this.schedule();
  }

  setMatches(matches: Set<string> | null): void {
    this.matches = matches;
    this.schedule();
  }

  setPalette(palette: GraphPalette): void {
    this.palette = palette;
    this.schedule();
  }

  zoomIn(): void {
    this.zoomAt(this.viewCenter(), 1.3);
  }

  zoomOut(): void {
    this.zoomAt(this.viewCenter(), 1 / 1.3);
  }

  fit(): void {
    const placed = this.nodes.filter((node) => node.x !== undefined && node.y !== undefined);
    if (placed.length === 0 || this.width === 0) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of placed) {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    const padding = 56;
    const availableHeight = this.height - TOOLBAR_INSET - BOTTOM_INSET;
    const k = clamp(
      Math.min((this.width - padding * 2) / Math.max(maxX - minX, 1), (availableHeight - padding) / Math.max(maxY - minY, 1)),
      MIN_ZOOM,
      2,
    );
    const centerY = TOOLBAR_INSET + availableHeight / 2;
    this.transform = { k, x: this.width / 2 - ((minX + maxX) / 2) * k, y: centerY - ((minY + maxY) / 2) * k };
    this.schedule();
  }

  // --- Internals -------------------------------------------------------------

  private neighborSet(id: string): Set<string> {
    let set = this.neighbors.get(id);
    if (!set) {
      set = new Set();
      this.neighbors.set(id, set);
    }
    return set;
  }

  private seedNear(node: SimNode, anchor: SimNode): void {
    if (node.x !== undefined || anchor.x === undefined || anchor.y === undefined) return;
    node.x = anchor.x + (Math.random() - 0.5) * 40;
    node.y = anchor.y + (Math.random() - 0.5) * 40;
  }

  private endpoint(value: string | number | SimNode): SimNode | undefined {
    return typeof value === "object" ? value : this.nodeById.get(String(value));
  }

  private viewCenter(): Point {
    return { x: this.width / 2, y: (this.height + TOOLBAR_INSET - BOTTOM_INSET) / 2 };
  }

  private toWorld(point: Point): Point {
    const { k, x, y } = this.transform;
    return { x: (point.x - x) / k, y: (point.y - y) / k };
  }

  private localPoint(event: { clientX: number; clientY: number }): Point {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private zoomAt(point: Point, factor: number): void {
    const k = clamp(this.transform.k * factor, MIN_ZOOM, MAX_ZOOM);
    const world = this.toWorld(point);
    this.transform = { k, x: point.x - world.x * k, y: point.y - world.y * k };
    this.schedule();
  }

  private hitTest(point: Point): SimNode | null {
    const world = this.toWorld(point);
    const slop = 4 / this.transform.k;
    for (let index = this.nodes.length - 1; index >= 0; index--) {
      const node = this.nodes[index];
      if (node.x === undefined || node.y === undefined) continue;
      const reach = node.data.radius + slop;
      const dx = world.x - node.x;
      const dy = world.y - node.y;
      if (dx * dx + dy * dy <= reach * reach) return node;
    }
    return null;
  }

  private resize(): void {
    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    if (!this.sized) {
      this.sized = true;
      const center = this.viewCenter();
      this.transform = { k: 1, x: center.x, y: center.y };
    }
    this.draw();
  }

  private schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private tracePath(x: number, y: number, radius: number, type: GraphNodeType): void {
    const { ctx } = this;
    ctx.beginPath();
    if (type === "memory") {
      const r = radius * 1.25;
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
    } else {
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
  }

  private draw(): void {
    const { ctx, palette } = this;
    const { k, x, y } = this.transform;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.translate(x, y);
    ctx.scale(k, k);

    const focusId = this.drag?.mode === "node" ? this.drag.node.id : (this.hoverId ?? this.selectedId);
    const focus = focusId ? (this.neighbors.get(focusId) ?? new Set<string>()) : null;
    const isFocused = (id: string) => !focus || id === focusId || focus.has(id);
    const isMatched = (id: string) => !this.matches || this.matches.has(id);

    ctx.lineWidth = 1 / k;
    for (const link of this.links) {
      const source = this.endpoint(link.source);
      const target = this.endpoint(link.target);
      if (source?.x === undefined || source.y === undefined || target?.x === undefined || target.y === undefined) {
        continue;
      }
      const active = focusId !== null && (source.id === focusId || target.id === focusId);
      const dim = (focus !== null && !active) || (!isMatched(source.id) && !isMatched(target.id));
      ctx.globalAlpha = dim ? 0.1 : active ? 0.95 : 0.5;
      ctx.strokeStyle = active ? palette.edgeHighlight : palette.edge;
      ctx.setLineDash(link.kind === "project" ? [] : [3 / k, 3 / k]);
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const node of this.nodes) {
      if (node.x === undefined || node.y === undefined) continue;
      const dim = !isFocused(node.id) || !isMatched(node.id);
      ctx.globalAlpha = dim ? 0.18 : 1;
      const { radius, type, hollow } = node.data;
      const color = node.data.color ?? palette.hub;
      this.tracePath(node.x, node.y, radius, type);
      if (hollow) {
        ctx.lineWidth = 1.5 / k;
        ctx.strokeStyle = color;
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.fill();
      }
      if (node.id === this.selectedId) {
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius * (type === "memory" ? 1.25 : 1) + 3.5 / k, 0, Math.PI * 2);
        ctx.lineWidth = 1.5 / k;
        ctx.strokeStyle = palette.ring;
        ctx.stroke();
      }
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const node of this.nodes) {
      if (node.x === undefined || node.y === undefined) continue;
      const isHub = node.data.type === "hub";
      const show =
        isHub || k >= LABEL_ZOOM || node.id === focusId || node.id === this.selectedId || (focus?.has(node.id) ?? false);
      if (!show) continue;
      const dim = !isFocused(node.id) || !isMatched(node.id);
      ctx.globalAlpha = dim ? 0.25 : 1;
      ctx.font = `${isHub ? 600 : 400} ${(isHub ? 12 : 11) / k}px ${FONT}`;
      ctx.fillStyle = isHub ? palette.label : palette.labelMuted;
      const offset = node.data.radius * (node.data.type === "memory" ? 1.25 : 1) + 4 / k;
      ctx.fillText(truncateLabel(node.data.label), node.x, node.y + offset);
    }
    ctx.globalAlpha = 1;
  }

  private readonly handleTick = (): void => {
    if (this.needsFit && this.simulation.alpha() < 0.3) {
      this.needsFit = false;
      this.fit();
    }
    this.schedule();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const point = this.localPoint(event);
    const node = this.hitTest(point);
    this.canvas.setPointerCapture(event.pointerId);
    if (node) {
      this.drag = { mode: "node", node, startX: point.x, startY: point.y, moved: false };
    } else {
      this.drag = {
        mode: "pan",
        startX: point.x,
        startY: point.y,
        originX: this.transform.x,
        originY: this.transform.y,
        moved: false,
      };
      this.canvas.style.cursor = "grabbing";
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const point = this.localPoint(event);
    const drag = this.drag;
    if (drag) {
      const dx = point.x - drag.startX;
      const dy = point.y - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.moved = true;
      if (drag.mode === "node") {
        const world = this.toWorld(point);
        drag.node.fx = world.x;
        drag.node.fy = world.y;
        this.simulation.alphaTarget(0.3).restart();
      } else {
        this.transform = { ...this.transform, x: drag.originX + dx, y: drag.originY + dy };
        this.schedule();
      }
      return;
    }
    const id = this.hitTest(point)?.id ?? null;
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.canvas.style.cursor = id ? "pointer" : "default";
      this.schedule();
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    this.drag = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.canvas.style.cursor = this.hoverId ? "pointer" : "default";
    if (drag?.mode !== "node") return;
    drag.node.fx = null;
    drag.node.fy = null;
    this.simulation.alphaTarget(0);
    if (!drag.moved) this.onSelect(drag.node.data);
    this.schedule();
  };

  private readonly handlePointerLeave = (): void => {
    if (this.drag || this.hoverId === null) return;
    this.hoverId = null;
    this.schedule();
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      this.zoomAt(this.localPoint(event), Math.exp(-event.deltaY * 0.01));
    } else {
      this.transform = { ...this.transform, x: this.transform.x - event.deltaX, y: this.transform.y - event.deltaY };
      this.schedule();
    }
  };

  private readonly handleGestureStart = (event: Event): void => {
    event.preventDefault();
    this.gestureScale = 1;
  };

  private readonly handleGestureChange = (event: Event): void => {
    event.preventDefault();
    const gesture = event as GestureEventLike;
    const factor = gesture.scale / this.gestureScale;
    this.gestureScale = gesture.scale;
    this.zoomAt(this.localPoint(gesture), factor);
  };
}
