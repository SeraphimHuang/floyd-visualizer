import type { Graph } from './types';

/** One comparison inside the triple loop: is i → k → j shorter than i → j? */
export interface Step {
  k: number;
  i: number;
  j: number;
  /** dist[i][j] before this step. */
  before: number;
  /** dist[i][k] and dist[k][j] (these never change during round k). */
  ik: number;
  kj: number;
  /** ik + kj */
  candidate: number;
  updated: boolean;
  /**
   * i = k, j = k or i = j, and nothing changed. Without negative cycles these comparisons can
   * never improve anything; with them (arbitrage) they can, so updated ones are never trivial.
   */
  trivial: boolean;
}

export interface Trace {
  n: number;
  initDist: number[][];
  initNext: number[][];
  /** All n³ comparisons in loop order (k outer, then i, then j). */
  steps: Step[];
}

export interface MatrixState {
  dist: number[][];
  /** next[i][j] = the node right after i on the shortest i → j path, or -1. */
  next: number[][];
}

export function initialMatrices(graph: Graph): MatrixState {
  const n = graph.nodes.length;
  const dist = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)),
  );
  const next = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? i : -1)),
  );
  for (const e of graph.edges) {
    if (e.from === e.to) continue;
    if (e.weight < dist[e.from][e.to]) {
      dist[e.from][e.to] = e.weight;
      next[e.from][e.to] = e.to;
    }
  }
  return { dist, next };
}

const clone = (m: number[][]) => m.map((row) => row.slice());

/** Runs Floyd-Warshall and records every comparison. */
export function runFloyd(graph: Graph): Trace {
  const n = graph.nodes.length;
  const init = initialMatrices(graph);
  const dist = clone(init.dist);
  const next = clone(init.next);
  const steps: Step[] = [];

  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const ik = dist[i][k];
        const kj = dist[k][j];
        const candidate = ik + kj;
        const before = dist[i][j];
        const updated = candidate < before;
        if (updated) {
          dist[i][j] = candidate;
          next[i][j] = next[i][k];
        }
        steps.push({
          k, i, j, before, ik, kj, candidate, updated,
          trivial: (i === k || j === k || i === j) && !updated,
        });
      }
    }
  }
  return { n, initDist: init.dist, initNext: init.next, steps };
}

/** Matrix state after the first `p` steps have been applied (p = 0 is the initial matrix). */
export function stateAt(trace: Trace, p: number): MatrixState {
  const dist = clone(trace.initDist);
  const next = clone(trace.initNext);
  const end = Math.min(p, trace.steps.length);
  for (let s = 0; s < end; s++) {
    const st = trace.steps[s];
    if (st.updated) {
      dist[st.i][st.j] = st.candidate;
      next[st.i][st.j] = next[st.i][st.k];
    }
  }
  return { dist, next };
}

/** The node sequence of the current best i → j path, or null if unreachable. */
export function reconstructPath(next: number[][], i: number, j: number): number[] | null {
  if (next[i][j] === -1) return null;
  const path = [i];
  let u = i;
  while (u !== j) {
    u = next[u][j];
    if (u === -1 || path.length > next.length) return null;
    path.push(u);
  }
  return path;
}

// ---------- Granularity: which steps the player stops at ----------

export type Granularity = 'all' | 'pairs' | 'updates' | 'rounds';

export const GRANULARITY_LABELS: Record<Granularity, string> = {
  all: 'Every comparison',
  pairs: 'Every useful comparison',
  updates: 'Only updates',
  rounds: 'One round (k) at a time',
};

/** Positions p (0..N) the player stops at. Always includes 0 and N. */
export function stopsFor(trace: Trace, g: Granularity): number[] {
  const N = trace.steps.length;
  const n2 = trace.n * trace.n;
  const stops = [0];
  for (let p = 1; p <= N; p++) {
    const st = trace.steps[p - 1];
    const keep =
      g === 'all' ||
      (g === 'pairs' && !st.trivial) ||
      (g === 'updates' && st.updated) ||
      (g === 'rounds' && p % n2 === 0);
    if (keep) stops.push(p);
  }
  if (stops[stops.length - 1] !== N) stops.push(N);
  return stops;
}

/** Position just before round k starts. */
export const roundStart = (trace: Trace, k: number) => k * trace.n * trace.n;

/** Is position p the end of a round? */
export const isRoundEnd = (trace: Trace, p: number) =>
  p > 0 && p % (trace.n * trace.n) === 0;

// ---------- Negative cycles (arbitrage) ----------

/** Below this, a diagonal entry counts as negative (guards against floating-point noise). */
export const NEGATIVE_EPS = 1e-9;

export interface NegativeCycle {
  /** Node sequence, starting and ending at the same node, e.g. [0, 1, 2, 0]. */
  nodes: number[];
  /** Sum of the edge weights around the cycle (negative). */
  weight: number;
}

/**
 * Negative cycles visible in the current matrices: dist[i][i] < 0 means some loop from i back
 * to i has negative total weight. Follows `next` from i to recover the loop, checks it against
 * the real edges, and removes duplicates (the same loop seen from each of its nodes).
 */
export function findNegativeCycles(state: MatrixState, edgeWeight: (u: number, v: number) => number | undefined): NegativeCycle[] {
  const n = state.dist.length;
  const found = new Map<string, NegativeCycle>();
  for (let i = 0; i < n; i++) {
    if (!(state.dist[i][i] < -NEGATIVE_EPS)) continue;
    // Walk next[·][i] starting from i until a node repeats.
    const walk = [i];
    const seenAt = new Map([[i, 0]]);
    let u = i;
    let loop: number[] | null = null;
    for (let s = 0; s <= 2 * n; s++) {
      u = state.next[u][i];
      if (u < 0) break;
      if (seenAt.has(u)) {
        loop = walk.slice(seenAt.get(u)!);
        break;
      }
      seenAt.set(u, walk.length);
      walk.push(u);
    }
    if (!loop || loop.length < 2) continue;
    let weight = 0;
    let valid = true;
    for (let s = 0; s < loop.length; s++) {
      const w = edgeWeight(loop[s], loop[(s + 1) % loop.length]);
      if (w === undefined) { valid = false; break; }
      weight += w;
    }
    if (!valid || !(weight < -NEGATIVE_EPS)) continue;
    // Canonical rotation: start at the smallest node index.
    const start = loop.indexOf(Math.min(...loop));
    const rotated = [...loop.slice(start), ...loop.slice(0, start)];
    found.set(rotated.join(','), { nodes: [...rotated, rotated[0]], weight });
  }
  return [...found.values()].sort((a, b) => a.weight - b.weight);
}
