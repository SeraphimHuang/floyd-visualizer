import type { EditOp, Edge, Graph, GraphFile, Scenario, WeightProfile, WeightSpec } from './types';

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

  for (const e of file.edges) put(e.from, e.to, resolveWeight(e.weight, profileId));
  for (const op of ops) {
    if (op.type === 'remove') del(op.from, op.to);
    else put(op.from, op.to, resolveWeight(op.weight, profileId));
  }

  const out: Edge[] = [];
  for (const e of edges.values()) {
    const from = index.get(e.from);
    const to = index.get(e.to);
    if (from === undefined || to === undefined) continue;
    out.push({ from, to, weight: e.weight });
  }
  return { nodes: file.nodes, edges: out, units: file.units ?? '' };
}

export function scenarioOps(s: Scenario): EditOp[] {
  return [
    ...(s.removeEdges ?? []).map(([from, to]): EditOp => ({ type: 'remove', from, to })),
    ...(s.addEdges ?? []).map((e): EditOp => ({ type: 'set', from: e.from, to: e.to, weight: e.weight })),
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
    directed: true,
    units: file.units,
    nodes: file.nodes,
    edges: graph.edges.map((e) => ({
      from: graph.nodes[e.from].id,
      to: graph.nodes[e.to].id,
      weight: e.weight,
    })),
  };
}
