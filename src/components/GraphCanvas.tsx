import { useId } from 'react';
import { formatWeight } from '../core/graph';
import type { Graph } from '../core/types';

export interface Pt {
  x: number;
  y: number;
}

/** What to emphasize on the drawing. Indices are node indices. */
export interface Highlight {
  k: number | null;
  i: number | null;
  j: number | null;
  /** Current best path i ⇝ k and k ⇝ j. */
  pathIK: number[] | null;
  pathKJ: number[] | null;
  /** Path chosen by clicking two nodes (or a matrix cell). */
  query: number[] | null;
  querySrc: number | null;
  queryTgt: number | null;
  /** The same query on the original (unedited) graph, for comparison. */
  baseline: number[] | null;
}

export const NO_HIGHLIGHT: Highlight = {
  k: null, i: null, j: null, pathIK: null, pathKJ: null,
  query: null, querySrc: null, queryTgt: null, baseline: null,
};

export const edgeKey = (from: number, to: number) => `${from}-${to}`;

interface Props {
  graph: Graph;
  pos: Pt[];
  /** Node radius in drawing units. */
  r: number;
  fontSize: number;
  /** Show the long label (e.g. city name) under the node. */
  showLabels: boolean;
  viewBox?: string;
  hl: Highlight;
  /** Edges of the original graph that the edits removed (drawn as ghosts). */
  removedEdges: { from: number; to: number }[];
  /** Keys of edges that were added or re-weighted by edits. */
  changedEdges: Set<string>;
  editMode: boolean;
  selectedEdge: [number, number] | null;
  draftFrom: number | null;
  onNodeClick: (i: number) => void;
  onEdgeClick: (from: number, to: number) => void;
  onBackgroundClick: () => void;
}

const unit = (x: number, y: number) => {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
};

/** Quadratic curve from node a to node b, trimmed so it starts/ends at the node circles. */
function edgeGeometry(a: Pt, b: Pt, curved: boolean, r: number) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Bend to the right of the travel direction, so a→b and b→a curve apart.
  // Short edges (close cities on a map) still get a clear gap between the two directions.
  const bend = curved ? Math.min(Math.max(len * 0.16, r * 1.1), r * 2.4, len * 0.45) : 0;
  const c = { x: (a.x + b.x) / 2 + (dy / len) * bend * -1, y: (a.y + b.y) / 2 + (dx / len) * bend };
  const u1 = unit(c.x - a.x, c.y - a.y);
  const u2 = unit(b.x - c.x, b.y - c.y);
  const s = { x: a.x + u1.x * r, y: a.y + u1.y * r };
  const e = { x: b.x - u2.x * (r + 2), y: b.y - u2.y * (r + 2) };
  const mid = { x: 0.25 * s.x + 0.5 * c.x + 0.25 * e.x, y: 0.25 * s.y + 0.5 * c.y + 0.25 * e.y };
  return { d: `M${s.x},${s.y} Q${c.x},${c.y} ${e.x},${e.y}`, mid };
}

/**
 * Pick the side of a node (right, below, left, above) for its long label:
 * the side farthest from the node's edges, preferring the side facing away from the graph's center.
 */
function labelPlacement(p: Pt, neighbors: Pt[], center: Pt, r: number, fontSize: number) {
  const angles = neighbors.map((q) => Math.atan2(q.y - p.y, q.x - p.x));
  const outward = Math.atan2(p.y - center.y, p.x - center.x);
  const diff = (a: number, b: number) => {
    const d = Math.abs(a - b) % (2 * Math.PI);
    return d > Math.PI ? 2 * Math.PI - d : d;
  };
  let best = 0, bestScore = -Infinity;
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const clearance = angles.length ? Math.min(...angles.map((b) => diff(a, b))) : Math.PI;
    const score = clearance - 0.35 * diff(a, outward);
    if (score > bestScore) { bestScore = score; best = a; }
  }
  const gap = r + fontSize * 0.4;
  if (best === 0) return { x: gap, dy: '0.35em', textAnchor: 'start' } as const;
  if (best === Math.PI) return { x: -gap, dy: '0.35em', textAnchor: 'end' } as const;
  if (best < 0) return { y: -gap, textAnchor: 'middle' } as const;
  return { y: gap + fontSize * 0.75, textAnchor: 'middle' } as const;
}

interface LabelBox {
  x: number;
  y: number;
  /** Where the label wanted to be (the middle of its edge). */
  x0: number;
  y0: number;
  w: number;
  h: number;
  /** Unit normal of the edge, used to push apart labels that sit exactly on top of each other. */
  nx: number;
  ny: number;
}

/**
 * Nudges weight labels so they don't overlap each other or cover a node.
 * A few rounds of pairwise pushing is plenty for graphs of this size, and it's deterministic.
 */
function separateLabels(labels: LabelBox[], nodes: Pt[], r: number): LabelBox[] {
  const out = labels.map((l) => ({ ...l }));
  const pad = 3;
  for (let iter = 0; iter < 60; iter++) {
    let moved = false;
    for (let a = 0; a < out.length; a++) {
      for (let b = a + 1; b < out.length; b++) {
        const A = out[a], B = out[b];
        const dx = B.x - A.x, dy = B.y - A.y;
        const ox = (A.w + B.w) / 2 + pad - Math.abs(dx);
        const oy = (A.h + B.h) / 2 + pad - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        // Push along the axis with less overlap; if centered on each other, use the edge normal.
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
          A.x -= A.nx * 2; A.y -= A.ny * 2; B.x += A.nx * 2; B.y += A.ny * 2;
        } else if (ox < oy) {
          const m = (ox / 2 + 0.5) * Math.sign(dx || 1);
          A.x -= m; B.x += m;
        } else {
          const m = (oy / 2 + 0.5) * Math.sign(dy || 1);
          A.y -= m; B.y += m;
        }
      }
      // Keep labels off the node circles.
      const L = out[a];
      for (const n of nodes) {
        const cx = Math.max(L.x - L.w / 2, Math.min(n.x, L.x + L.w / 2));
        const cy = Math.max(L.y - L.h / 2, Math.min(n.y, L.y + L.h / 2));
        const d = Math.hypot(n.x - cx, n.y - cy);
        const need = r + pad - d;
        if (need > 0) {
          const u = unit(L.x - n.x || L.nx, L.y - n.y || L.ny);
          L.x += u.x * (need + 0.5);
          L.y += u.y * (need + 0.5);
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return out;
}

const MARKERS = ['base', 'ik', 'kj', 'query', 'baseline', 'ghost', 'changed'] as const;
type Marker = (typeof MARKERS)[number];

export function GraphCanvas(props: Props) {
  const { graph, pos, r, fontSize, hl } = props;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const marker = (m: Marker) => `url(#${uid}-${m})`;
  const arrow = Math.max(8, r * 0.55);

  const edgeSet = new Set(graph.edges.map((e) => edgeKey(e.from, e.to)));
  const geom = (u: number, v: number) =>
    edgeGeometry(pos[u], pos[v], edgeSet.has(edgeKey(v, u)), r);

  const pathSegments = (path: number[] | null, cls: string, m: Marker) =>
    path && path.length > 1
      ? path.slice(1).map((v, s) => (
          <path key={`${cls}-${s}`} d={geom(path[s], v).d} className={`overlay ${cls}`} markerEnd={marker(m)} />
        ))
      : null;

  if (pos.length !== graph.nodes.length) return null;
  const center = {
    x: pos.reduce((s, q) => s + q.x, 0) / pos.length,
    y: pos.reduce((s, q) => s + q.y, 0) / pos.length,
  };
  // Weight labels start at the middle of their edge, then get pushed apart if they collide.
  const labelTexts = graph.edges.map((e) => formatWeight(e.weight));
  const labelBoxes = separateLabels(
    graph.edges.map((e, idx) => {
      const { mid } = geom(e.from, e.to);
      const a = pos[e.from], b = pos[e.to];
      const n = unit(-(b.y - a.y), b.x - a.x);
      return {
        x: mid.x,
        y: mid.y,
        x0: mid.x,
        y0: mid.y,
        w: labelTexts[idx].length * fontSize * 0.62 + fontSize * 0.7,
        h: fontSize * 1.35,
        nx: n.x,
        ny: n.y,
      };
    }),
    pos,
    r,
  );
  const neighbors = graph.nodes.map((): number[] => []);
  for (const e of graph.edges) {
    neighbors[e.from].push(e.to);
    neighbors[e.to].push(e.from);
  }

  return (
    <svg
      className="graph-canvas"
      viewBox={props.viewBox}
      preserveAspectRatio="xMidYMid meet"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onBackgroundClick();
      }}
    >
      <defs>
        {MARKERS.map((m) => (
          <marker
            key={m}
            id={`${uid}-${m}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth={arrow}
            markerHeight={arrow}
            markerUnits="userSpaceOnUse"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" className={`arrow arrow-${m}`} />
          </marker>
        ))}
      </defs>

      {/* Ghosts of removed edges */}
      {props.removedEdges.map((e) => (
        <path
          key={`ghost-${edgeKey(e.from, e.to)}`}
          d={geom(e.from, e.to).d}
          className="edge edge-ghost"
          markerEnd={marker('ghost')}
        />
      ))}

      {/* Base edges */}
      {graph.edges.map((e) => {
        const k = edgeKey(e.from, e.to);
        const changed = props.changedEdges.has(k);
        const selected = props.selectedEdge?.[0] === e.from && props.selectedEdge?.[1] === e.to;
        return (
          <path
            key={k}
            d={geom(e.from, e.to).d}
            className={`edge${changed ? ' edge-changed' : ''}${selected ? ' edge-selected' : ''}`}
            markerEnd={marker(changed ? 'changed' : 'base')}
          />
        );
      })}

      {/* Highlighted paths */}
      {pathSegments(hl.baseline, 'path-baseline', 'baseline')}
      {pathSegments(hl.pathIK, 'path-ik', 'ik')}
      {pathSegments(hl.pathKJ, 'path-kj', 'kj')}
      {pathSegments(hl.query, 'path-query', 'query')}

      {/* Click targets for edges (edit mode) */}
      {props.editMode &&
        graph.edges.map((e) => (
          <path
            key={`hit-${edgeKey(e.from, e.to)}`}
            d={geom(e.from, e.to).d}
            className="edge-hit"
            onClick={() => props.onEdgeClick(e.from, e.to)}
          />
        ))}

      {/* Thin leader lines for labels that had to move away from their edge */}
      {labelBoxes.map((b, idx) =>
        Math.hypot(b.x - b.x0, b.y - b.y0) > b.h * 0.9 ? (
          <line key={`leader-${idx}`} className="label-leader" x1={b.x0} y1={b.y0} x2={b.x} y2={b.y} />
        ) : null,
      )}

      {/* Weight labels */}
      {graph.edges.map((e, idx) => {
        const box = labelBoxes[idx];
        const text = labelTexts[idx];
        const { w, h } = box;
        return (
          <g
            key={`label-${edgeKey(e.from, e.to)}`}
            className={`edge-label${props.editMode ? ' clickable' : ''}`}
            transform={`translate(${box.x},${box.y})`}
            onClick={props.editMode ? () => props.onEdgeClick(e.from, e.to) : undefined}
          >
            <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} />
            <text dy="0.35em" style={{ fontSize }}>{text}</text>
          </g>
        );
      })}

      {/* Nodes */}
      {graph.nodes.map((n, i) => {
        const p = pos[i];
        const cls = [
          'node',
          hl.k === i && 'is-k',
          hl.i === i && 'is-i',
          hl.j === i && 'is-j',
          (hl.querySrc === i || hl.queryTgt === i) && 'is-query',
          props.draftFrom === i && 'is-draft',
        ]
          .filter(Boolean)
          .join(' ');
        const idSize = n.id.length > 2 ? fontSize * 0.85 : fontSize * 1.1;
        return (
          <g key={n.id} className={cls} transform={`translate(${p.x},${p.y})`} onClick={() => props.onNodeClick(i)}>
            <title>{n.label && n.label !== n.id ? `${n.label} (${n.id})` : n.id}</title>
            <circle r={r} />
            <text className="node-id" dy="0.35em" style={{ fontSize: idSize }}>{n.id}</text>
            {hl.k === i && (
              <text className="node-tag" y={-r - fontSize * 0.5} style={{ fontSize: fontSize * 0.85 }}>k</text>
            )}
            {props.showLabels && n.label && n.label !== n.id && (
              <text className="node-label" {...labelPlacement(p, neighbors[i].map((v) => pos[v]), center, r, fontSize)} style={{ fontSize: fontSize * 0.9 }}>
                {n.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
