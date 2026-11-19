import type { EditOp, Edge, Graph, GraphFile, GraphMode, Scenario, WeightProfile, WeightSpec } from './types';

// ---------- Exchange rates ↔ weights ----------

/** Rate → weight. `|| 0` turns −0 into 0. */
export const rateToWeight = (rate: number) => -Math.log(rate) || 0;
/** Weight → rate. ∞ (no way to trade) becomes 0. */
export const weightToRate = (w: number) => Math.exp(-w);

export function formatRate(rate: number): string {
  if (rate === 0) return '—';
  return String(Number(rate.toPrecision(4)));
}

export function formatLogWeight(w: number): string {
  if (w === Infinity) return '∞';
  if (w === -Infinity) return '−∞';
  return (Math.abs(w) < 5e-4 ? 0 : w).toFixed(3).replace('-', '−');
}

/** How a dist value is shown: exchange graphs can show rates or the −ln weights. */
export type Display = 'rate' | 'weight';

export function valueFormatter(mode: GraphMode, display: Display): (w: number) => string {
  if (mode !== 'exchange') return (w) => formatWeight(w);
  return display === 'rate' ? (w) => formatRate(weightToRate(w)) : formatLogWeight;
}

export function getProfiles(file: GraphFile): WeightProfile[] {
  return (file.weightProfiles ?? []).map((p) =>
    typeof p === 'string' ? { id: p, label: p } : p,
  );
}

export function resolveWeight(w: WeightSpec, profileId: string | null): number {
  if (typeof w === 'number') return w;
  if (profileId && profileId in w) return w[profileId];
  const first = Object.values(w)[0];
  return first ?? Infinity;
}

const key = (from: string, to: string) => `${from}\u0000${to}`;

/**
 * Builds the graph the algorithm runs on: the file's edges for one weight
 * profile, with edits applied on top in order.
 */
export function buildGraph(file: GraphFile, profileId: string | null, ops: EditOp[] = []): Graph {
  const directed = file.directed !== false;
  const mode: GraphMode = file.mode ?? 'distance';
  // In exchange mode, file values and edit values are rates.
  const toWeight = (v: number) => (mode === 'exchange' ? rateToWeight(v) : v);
  const index = new Map(file.nodes.map((n, i) => [n.id, i]));
  // Insertion-ordered map keeps edge order stable across edits.
  const edges = new Map<string, { from: string; to: string; weight: number }>();

  const put = (from: string, to: string, weight: number) => {
    edges.set(key(from, to), { from, to, weight });
    if (!directed) edges.set(key(to, from), { from: to, to: from, weight });
  };
  const del = (from: string, to: string) => {
    edges.delete(key(from, to));
    if (!directed) edges.delete(key(to, from));
  };

  for (const e of file.edges)
    put(e.from, e.to, toWeight(mode === 'exchange' ? e.rate! : resolveWeight(e.weight!, profileId)));
  for (const op of ops) {
    if (op.type === 'remove') del(op.from, op.to);
    else put(op.from, op.to, toWeight(resolveWeight(op.weight, profileId)));
  }

  const out: Edge[] = [];
  for (const e of edges.values()) {
    const from = index.get(e.from);
    const to = index.get(e.to);
    if (from === undefined || to === undefined) continue;
    out.push({ from, to, weight: e.weight });
  }
  return { nodes: file.nodes, edges: out, units: file.units ?? '', mode };
}

export function scenarioOps(s: Scenario): EditOp[] {
  return [
    ...(s.removeEdges ?? []).map(([from, to]): EditOp => ({ type: 'remove', from, to })),
    ...(s.addEdges ?? []).map((e): EditOp => ({ type: 'set', from: e.from, to: e.to, weight: (e.rate ?? e.weight)! })),
  ];
}

export const nodeName = (g: Graph, i: number) => g.nodes[i].id;
export const nodeLabel = (g: Graph, i: number) => g.nodes[i].label ?? g.nodes[i].id;

export function formatWeight(w: number, units = ''): string {
  if (w === Infinity) return '∞';
  const s = Number.isInteger(w) ? String(w) : w.toFixed(1);
  return units ? `${s} ${units}` : s;
}

export function describeOp(op: EditOp): string {
  return op.type === 'remove'
    ? `Removed ${op.from} → ${op.to}`
    : `Set ${op.from} → ${op.to} = ${typeof op.weight === 'number' ? op.weight : JSON.stringify(op.weight)}`;
}

/** The current graph as a single-profile file, for "Export JSON". */
export function exportGraph(file: GraphFile, graph: Graph, profileLabel: string | null): GraphFile {
  return {
    name: `${file.name}${profileLabel ? ` (${profileLabel})` : ''} (edited)`,
    description: file.description,
    ...(graph.mode === 'exchange' ? { mode: 'exchange' as const } : {}),
    directed: true,
    units: file.units,
    nodes: file.nodes,
    edges: graph.edges.map((e) => {
      const from = graph.nodes[e.from].id, to = graph.nodes[e.to].id;
      return graph.mode === 'exchange'
        ? { from, to, rate: Number(weightToRate(e.weight).toPrecision(6)) }
        : { from, to, weight: e.weight };
    }),
  };
}
