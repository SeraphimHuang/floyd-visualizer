import { isRoundEnd, NEGATIVE_EPS, type Step, type Trace } from './floyd';
import { formatLogWeight, formatRate, formatWeight, nodeName, weightToRate, type Display } from './graph';
import type { Graph } from './types';

export interface Narration {
  title: string;
  detail: string;
  tone: 'neutral' | 'update' | 'skip' | 'done' | 'alert';
}

/**
 * How numbers are combined in the sentence.
 * - sum:     distances (or −ln weights): dist[i][k] + dist[k][j] < dist[i][j]
 * - product: exchange rates:             rate[i][k] × rate[k][j] > rate[i][j]
 */
interface Arith {
  op: string;
  better: string;
  notBetter: string;
  val: (w: number) => string;
  /** Matrix name used in sentences: "dist" or "rate". */
  m: string;
}

function arith(graph: Graph, display: Display): Arith {
  if (graph.mode === 'exchange' && display === 'rate') {
    return { op: '×', better: '>', notBetter: '≤', val: (w) => formatRate(weightToRate(w)), m: 'rate' };
  }
  return {
    op: '+',
    better: '<',
    notBetter: '≥',
    val: graph.mode === 'exchange' ? formatLogWeight : (w) => formatWeight(w),
    m: 'dist',
  };
}

/** One sentence describing what happened at position p. */
export function narrate(
  graph: Graph,
  trace: Trace,
  p: number,
  roundsMode: boolean,
  display: Display = 'rate',
  finalDist?: number[][],
): Narration {
  const N = trace.steps.length;
  const name = (i: number) => nodeName(graph, i);
  const A = arith(graph, display);
  const exchange = graph.mode === 'exchange';

  if (p === 0) {
    return {
      title: 'Initial matrix',
      detail: exchange
        ? display === 'rate'
          ? 'Each cell starts as the direct exchange rate (— if there is no direct trade, 1 on the diagonal). ' +
            'Behind the scenes the algorithm uses weights −ln(rate): adding weights multiplies rates, so the "shortest" path is the best rate.'
          : 'Each cell starts as −ln(direct rate) (∞ if there is no direct trade, 0 on the diagonal). ' +
            'A negative total around a loop means the loop multiplies your money: arbitrage.'
        : 'dist[i][j] starts as the direct edge weight (∞ if there is no edge, 0 on the diagonal). ' +
          'Next, we try each node in turn as an intermediate stop k.',
      tone: 'neutral',
    };
  }

  if (p === N) {
    const total = trace.steps.filter((s) => s.updated).length;
    const negative = finalDist?.some((row, i) => row[i] < -NEGATIVE_EPS);
    if (negative) {
      return {
        title: 'Finished · arbitrage found',
        detail:
          'Some diagonal entry ended up below 0 (a rate above 1 from a coin back to itself): a loop of trades that returns more than it started with. ' +
          'See the Arbitrage panel. Because of that loop, other "best rates" could grow without limit.',
        tone: 'alert',
      };
    }
    return {
      title: `Finished · ${trace.n} rounds, ${N} comparisons, ${total} updates`,
      detail: exchange
        ? 'Every cell now holds the best rate between two coins, and no loop of trades makes money. ' +
          'Click two nodes (or a matrix cell) to see the best route.'
        : 'Every dist[i][j] is now the shortest distance from i to j. ' +
          'Click two nodes (or a matrix cell) to see the path.',
      tone: 'done',
    };
  }

  if (roundsMode && isRoundEnd(trace, p)) {
    const k = p / (trace.n * trace.n) - 1;
    const roundSteps = trace.steps.slice(p - trace.n * trace.n, p);
    const ups = roundSteps.filter((s) => s.updated);
    const list = ups.map((s) => `${name(s.i)}→${name(s.j)}`).join(', ');
    const loops = ups.filter((s) => s.i === s.j && s.candidate < -NEGATIVE_EPS);
    return {
      title: `Round k = ${name(k)} done`,
      detail:
        (ups.length
          ? `Going through ${name(k)} improved ${ups.length} entr${ups.length > 1 ? 'ies' : 'y'}: ${list}.`
          : `Going through ${name(k)} did not improve anything.`) +
        (loops.length ? ` Arbitrage loop found through ${loops.map((s) => name(s.i)).join(', ')}!` : ''),
      tone: loops.length ? 'alert' : ups.length ? 'update' : 'skip',
    };
  }

  return narrateStep(trace.steps[p - 1], name, A);
}

function narrateStep(s: Step, name: (i: number) => string, A: Arith): Narration {
  const [K, I, J] = [name(s.k), name(s.i), name(s.j)];
  const head = `k = ${K} · ${A.m}[${I}][${J}]`;

  // Comparisons that can't help: a 0 diagonal, or a 0-cost "detour" through k itself.
  if (s.trivial) {
    const why =
      s.i === s.j && s.before === 0 && s.candidate >= 0
        ? `${I} → ${I} stays as it is.`
        : s.i === s.k && s.ik === 0
          ? `The route starts at ${K}, so going "through ${K}" changes nothing.`
          : s.j === s.k && s.kj === 0
            ? `The route ends at ${K}, so going "through ${K}" changes nothing.`
            : null;
    if (why) return { title: head, detail: `${why} Skip.`, tone: 'skip' };
  }

  if (s.ik === Infinity || s.kj === Infinity) {
    const missing = s.ik === Infinity ? `${I} → ${K}` : `${K} → ${J}`;
    return {
      title: head,
      detail: `No route ${missing} is known yet, so we can't go through ${K}. Keep ${A.val(s.before)}.`,
      tone: 'skip',
    };
  }

  // Use m[][] notation (not "A→B→D") because m[i][k] may already be a multi-edge route.
  const sum =
    `${A.m}[${I}][${K}] ${A.op} ${A.m}[${K}][${J}] = ` +
    `${A.val(s.ik)} ${A.op} ${A.val(s.kj)} = ${A.val(s.candidate)}`;
  if (s.updated) {
    if (s.i === s.j && s.candidate < -NEGATIVE_EPS) {
      return {
        title: head,
        detail:
          `Through ${K}: ${sum} ${A.better} ${A.val(s.before)}. ` +
          (A.m === 'rate' ? `In −ln weights: dist[${I}][${I}] = ${formatLogWeight(s.candidate)} < 0, a negative cycle! ` : 'A negative cycle! ') +
          `Trading ${I} around a loop ends with MORE ${I} than we started with: arbitrage.`,
        tone: 'alert',
      };
    }
    return {
      title: head,
      detail: `Through ${K}: ${sum} ${A.better} ${A.val(s.before)}. Better! ${A.m}[${I}][${J}] becomes ${A.val(s.candidate)}.`,
      tone: 'update',
    };
  }
  return {
    title: head,
    detail: `Through ${K}: ${sum} ${A.notBetter} ${A.val(s.before)}. Not better, keep ${A.val(s.before)}.`,
    tone: 'neutral',
  };
}
