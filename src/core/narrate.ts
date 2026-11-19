import { isRoundEnd, type Trace } from './floyd';
import { formatWeight, nodeName } from './graph';
import type { Graph } from './types';

export interface Narration {
  title: string;
  detail: string;
  tone: 'neutral' | 'update' | 'skip' | 'done';
}

/** One sentence describing what happened at position p. */
export function narrate(graph: Graph, trace: Trace, p: number, roundsMode: boolean): Narration {
  const N = trace.steps.length;
  const name = (i: number) => nodeName(graph, i);
  const w = (x: number) => formatWeight(x);

  if (p === 0) {
    return {
      title: 'Initial matrix',
      detail:
        'dist[i][j] starts as the direct edge weight (∞ if there is no edge, 0 on the diagonal). ' +
        'Next, we try each node in turn as an intermediate stop k.',
      tone: 'neutral',
    };
  }

  if (p === N) {
    const total = trace.steps.filter((s) => s.updated).length;
    return {
      title: `Finished · ${trace.n} rounds, ${N} comparisons, ${total} updates`,
      detail:
        'Every dist[i][j] is now the shortest distance from i to j. ' +
        'Click two nodes (or a matrix cell) to see the path.',
      tone: 'done',
    };
  }

  if (roundsMode && isRoundEnd(trace, p)) {
    const k = p / (trace.n * trace.n) - 1;
    const roundSteps = trace.steps.slice(p - trace.n * trace.n, p);
    const ups = roundSteps.filter((s) => s.updated);
    const list = ups.map((s) => `${name(s.i)}→${name(s.j)}`).join(', ');
    return {
      title: `Round k = ${name(k)} done`,
      detail: ups.length
        ? `Going through ${name(k)} shortened ${ups.length} path${ups.length > 1 ? 's' : ''}: ${list}.`
        : `Going through ${name(k)} did not shorten any path.`,
      tone: ups.length ? 'update' : 'skip',
    };
  }

  const s = trace.steps[p - 1];
  const [K, I, J] = [name(s.k), name(s.i), name(s.j)];
  const head = `k = ${K} · dist[${I}][${J}]`;

  if (s.trivial) {
    const why =
      s.i === s.j
        ? `${I} → ${I} is already 0.`
        : s.i === s.k
          ? `The path starts at ${K}, so going "through ${K}" changes nothing.`
          : `The path ends at ${K}, so going "through ${K}" changes nothing.`;
    return { title: head, detail: `${why} Skip.`, tone: 'skip' };
  }

  if (s.ik === Infinity || s.kj === Infinity) {
    const missing = s.ik === Infinity ? `${I} → ${K}` : `${K} → ${J}`;
    return {
      title: head,
      detail: `There is no known path ${missing} yet (∞), so we can't go through ${K}. Keep ${w(s.before)}.`,
      tone: 'skip',
    };
  }

  const sum = `${I}→${K}→${J} = ${w(s.ik)} + ${w(s.kj)} = ${w(s.candidate)}`;
  if (s.updated) {
    return {
      title: head,
      detail: `Through ${K}: ${sum} < ${w(s.before)}. Shorter! Update dist[${I}][${J}] = ${w(s.candidate)}.`,
      tone: 'update',
    };
  }
  return {
    title: head,
    detail: `Through ${K}: ${sum} ≥ ${w(s.before)}. Not shorter, keep ${w(s.before)}.`,
    tone: 'neutral',
  };
}
