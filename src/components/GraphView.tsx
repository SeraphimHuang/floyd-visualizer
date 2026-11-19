import { useMemo } from 'react';
import type { GraphNode } from '../core/types';
import { GraphCanvas, type Pt } from './GraphCanvas';

type CanvasProps = Omit<Parameters<typeof GraphCanvas>[0], 'pos' | 'r' | 'fontSize' | 'viewBox' | 'showLabels'>;

const W = 1000;
const H = 640;
const PAD = 90;

/** Raw positions: x/y if every node has them, else projected lat/lng, else a circle. */
function rawPositions(nodes: GraphNode[]): Pt[] {
  if (nodes.every((n) => n.x !== undefined && n.y !== undefined)) {
    return nodes.map((n) => ({ x: n.x!, y: n.y! }));
  }
  if (nodes.every((n) => n.lat !== undefined && n.lng !== undefined)) {
    const lat0 = nodes.reduce((s, n) => s + n.lat!, 0) / nodes.length;
    const c = Math.cos((lat0 * Math.PI) / 180);
    return nodes.map((n) => ({ x: n.lng! * c, y: -n.lat! }));
  }
  return nodes.map((_, i) => {
    const a = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    return { x: Math.cos(a), y: Math.sin(a) };
  });
}

/** Scale positions to fill the drawing area, keeping their shape. */
function fit(points: Pt[]): Pt[] {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const w = maxX - minX || 1, h = maxY - minY || 1;
  const s = Math.min((W - 2 * PAD) / w, (H - 2 * PAD) / h);
  const ox = (W - w * s) / 2, oy = (H - h * s) / 2;
  return points.map((p) => ({ x: ox + (p.x - minX) * s, y: oy + (p.y - minY) * s }));
}

/** Plain (non-map) view of the graph. */
export function GraphView(props: CanvasProps) {
  const pos = useMemo(() => fit(rawPositions(props.graph.nodes)), [props.graph.nodes]);
  const n = props.graph.nodes.length;
  // Big enough to read from the back of a room when projected.
  const r = n <= 5 ? 40 : n <= 8 ? 32 : 24;
  const fontSize = n <= 5 ? 30 : n <= 8 ? 22 : 18;
  const showLabels = props.graph.nodes.some((nd) => nd.label && nd.label !== nd.id);
  return (
    <div className="graph-view">
      <GraphCanvas {...props} pos={pos} r={r} fontSize={fontSize} viewBox={`0 0 ${W} ${H}`} showLabels={showLabels} />
    </div>
  );
}
