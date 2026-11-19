import { describe, expect, it } from 'vitest';
import { reconstructPath, runFloyd, stateAt, stopsFor } from './floyd';
import { buildGraph } from './graph';
import type { GraphFile } from './types';
import toy4 from '../../data/toy4.json';

const INF = Infinity;

/** Plain O(n³) reference implementation, no tracing. */
function reference(n: number, edges: [number, number, number][]): number[][] {
  const d = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : INF)));
  for (const [u, v, w] of edges) d[u][v] = Math.min(d[u][v], w);
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) if (d[i][k] + d[k][j] < d[i][j]) d[i][j] = d[i][k] + d[k][j];
  return d;
}

describe('runFloyd', () => {
  const graph = buildGraph(toy4 as GraphFile, null);
  const trace = runFloyd(graph);

  it('records n³ comparisons', () => {
    expect(trace.steps).toHaveLength(64);
  });

  it('finds the known all-pairs shortest distances for the 4-node example', () => {
    expect(stateAt(trace, trace.steps.length).dist).toEqual([
      [0, 3, 5, 6],
      [5, 0, 2, 3],
      [3, 6, 0, 1],
      [2, 5, 7, 0],
    ]);
  });

  it('starts from the direct edge weights', () => {
    expect(stateAt(trace, 0).dist).toEqual([
      [0, 3, INF, 7],
      [8, 0, 2, INF],
      [5, INF, 0, 1],
      [2, INF, INF, 0],
    ]);
  });

  it('reconstructs paths whose edge weights add up to the distance', () => {
    const { dist, next } = stateAt(trace, trace.steps.length);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        const path = reconstructPath(next, i, j)!;
        expect(path[0]).toBe(i);
        expect(path[path.length - 1]).toBe(j);
        let sum = 0;
        for (let s = 0; s + 1 < path.length; s++)
          sum += graph.edges.find((e) => e.from === path[s] && e.to === path[s + 1])!.weight;
        expect(sum).toBe(dist[i][j]);
      }
  });

  it('matches a reference implementation on random graphs', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let t = 0; t < 50; t++) {
      const n = 2 + Math.floor(rand() * 7);
      const edges: [number, number, number][] = [];
      for (let u = 0; u < n; u++)
        for (let v = 0; v < n; v++) if (u !== v && rand() < 0.4) edges.push([u, v, Math.floor(rand() * 20)]);
      const g = {
        nodes: Array.from({ length: n }, (_, i) => ({ id: String(i) })),
        edges: edges.map(([from, to, weight]) => ({ from, to, weight })),
        units: '',
        mode: 'distance' as const,
      };
      const tr = runFloyd(g);
      expect(stateAt(tr, tr.steps.length).dist).toEqual(reference(n, edges));
    }
  });

  it('builds stop lists that always include the start and the end', () => {
    for (const g of ['all', 'pairs', 'updates', 'rounds'] as const) {
      const stops = stopsFor(trace, g);
      expect(stops[0]).toBe(0);
      expect(stops[stops.length - 1]).toBe(64);
    }
    expect(stopsFor(trace, 'all')).toHaveLength(65);
    expect(stopsFor(trace, 'pairs')).toHaveLength(1 + 4 * 3 * 2 + 1); // start + (n-1)(n-2) useful per round + end
    expect(stopsFor(trace, 'rounds')).toEqual([0, 16, 32, 48, 64]);
  });
});

describe('buildGraph', () => {
  it('applies remove and set edits on top of the file', () => {
    const g = buildGraph(toy4 as GraphFile, null, [
      { type: 'remove', from: 'C', to: 'D' },
      { type: 'set', from: 'A', to: 'C', weight: 1 },
      { type: 'set', from: 'A', to: 'B', weight: 9 },
    ]);
    const has = (f: number, t: number) => g.edges.find((e) => e.from === f && e.to === t);
    expect(has(2, 3)).toBeUndefined();
    expect(has(0, 2)?.weight).toBe(1);
    expect(has(0, 1)?.weight).toBe(9);
  });

  it('adds both directions for undirected files', () => {
    const file: GraphFile = {
      name: 'u', directed: false,
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ from: 'a', to: 'b', weight: 2 }],
    };
    expect(buildGraph(file, null).edges).toHaveLength(2);
  });
});
