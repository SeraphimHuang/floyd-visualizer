import { describe, expect, it } from 'vitest';
import { findNegativeCycles, runFloyd, stateAt, stopsFor } from './floyd';
import { buildGraph, scenarioOps, weightToRate } from './graph';
import type { Graph, GraphFile } from './types';
import { validateGraphFile } from './validate';
import coinsJson from '../../data/cute-coins.json';

const coins = coinsJson as GraphFile;

function arbitrage(graph: Graph) {
  const trace = runFloyd(graph);
  const final = stateAt(trace, trace.steps.length);
  const w = new Map(graph.edges.map((e) => [`${e.from}-${e.to}`, e.weight]));
  return { trace, cycles: findNegativeCycles(final, (u, v) => w.get(`${u}-${v}`)) };
}
const ids = (g: Graph, nodes: number[]) => nodes.map((i) => g.nodes[i].id).join('');

describe('exchange mode', () => {
  const graph = buildGraph(coins, null);

  it('stores −ln(rate) as the edge weight', () => {
    const e = graph.edges.find((x) => graph.nodes[x.from].id === '🐱' && graph.nodes[x.to].id === '🐶')!;
    expect(e.weight).toBeCloseTo(-Math.log(1.19), 12);
    expect(weightToRate(e.weight)).toBeCloseTo(1.19, 12);
  });

  it('finds exactly the one mispriced loop 🐱 → 🐶 → 🦆 → 🐱 (+5.3%)', () => {
    const { cycles } = arbitrage(graph);
    expect(cycles).toHaveLength(1);
    expect(ids(graph, cycles[0].nodes)).toBe('🐱🐶🦆🐱');
    expect(weightToRate(cycles[0].weight)).toBeCloseTo(1.19 * 0.61 * 1.45, 9);
  });

  it('finds no arbitrage once the Duck price is fixed', () => {
    const fix = coins.scenarios!.find((s) => s.name === 'Fix the Duck price')!;
    expect(arbitrage(buildGraph(coins, null, scenarioOps(fix))).cycles).toHaveLength(0);
  });

  it('finds the new 🐱 ⇄ 🐼 loop in the Panda pump scenario', () => {
    const pump = coins.scenarios!.find((s) => s.name === 'Panda pump')!;
    const g = buildGraph(coins, null, scenarioOps(pump));
    expect(arbitrage(g).cycles.map((c) => ids(g, c.nodes))).toEqual(['🐱🐼🐱']);
  });

  it('with several loops, every recovered loop is real (product > 1)', () => {
    // Both the Duck mispricing and the Panda pump: two separate money-making loops.
    const g = buildGraph(coins, null, [{ type: 'set', from: '🐼', to: '🐱', weight: 2.2 }]);
    const { cycles, trace } = arbitrage(g);
    expect(cycles.length).toBeGreaterThan(0);
    for (const c of cycles) expect(weightToRate(c.weight)).toBeGreaterThan(1);
    // Floyd-Warshall still flags every coin that sits on a loop via a negative diagonal.
    const final = stateAt(trace, trace.steps.length);
    const flagged = g.nodes.filter((_, i) => final.dist[i][i] < 0).map((n) => n.id);
    for (const id of ['🐱', '🐶', '🦆', '🐼']) expect(flagged).toContain(id);
  });

  it('does not hide diagonal updates as "trivial" (that is where arbitrage shows up)', () => {
    const { trace } = arbitrage(graph);
    const diag = trace.steps.filter((s) => s.i === s.j && s.updated);
    expect(diag.length).toBeGreaterThan(0);
    expect(diag.every((s) => !s.trivial)).toBe(true);
    // ...and the "useful comparisons" player mode stops at them.
    const stops = new Set(stopsFor(trace, 'pairs'));
    const firstDiag = trace.steps.findIndex((s) => s.i === s.j && s.updated) + 1;
    expect(stops.has(firstDiag)).toBe(true);
  });

  it('validates rates', () => {
    const base = { name: 'x', mode: 'exchange', nodes: [{ id: 'a' }, { id: 'b' }] };
    expect(validateGraphFile({ ...base, edges: [{ from: 'a', to: 'b', rate: 2 }] })).toEqual([]);
    expect(validateGraphFile({ ...base, edges: [{ from: 'a', to: 'b', rate: 0 }] })[0]).toMatch(/greater than 0/);
    expect(validateGraphFile({ ...base, edges: [{ from: 'a', to: 'b', weight: 2 }] }).join()).toMatch(/use "rate"/);
    expect(
      validateGraphFile({ name: 'y', nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b', rate: 2 }] }).join(),
    ).toMatch(/only for "mode": "exchange"/);
  });
});
