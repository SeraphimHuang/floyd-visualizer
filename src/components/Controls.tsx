import { GRANULARITY_LABELS, roundStart, type Granularity, type Trace } from '../core/floyd';
import type { Graph } from '../core/types';

interface Props {
  graph: Graph;
  trace: Trace;
  /** Positions the player stops at (depends on the granularity). */
  stops: number[];
  p: number;
  playing: boolean;
  speed: number;
  granularity: Granularity;
  currentK: number | null;
  onSeek: (p: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onTogglePlay: () => void;
  onSpeed: (s: number) => void;
  onGranularity: (g: Granularity) => void;
}

export function Controls(props: Props) {
  const { trace, p, graph } = props;
  const N = trace.steps.length;
  const step = p > 0 ? trace.steps[p - 1] : null;
  const name = (i: number) => graph.nodes[i].id;
  // First stop inside round k (not the position just before it, which still belongs to round k-1).
  const jumpToRound = (k: number) => {
    const lo = roundStart(trace, k), hi = lo + trace.n * trace.n;
    props.onSeek(props.stops.find((x) => x > lo && x <= hi) ?? lo + 1);
  };

  return (
    <div className="controls">
      <div className="controls-row">
        <div className="btn-group">
          <button onClick={() => props.onSeek(0)} disabled={p === 0} title="Restart (Home)">⏮</button>
          <button onClick={props.onPrev} disabled={p === 0} title="Previous (←)">◀</button>
          <button className="play" onClick={props.onTogglePlay} title="Play / pause (Space)">
            {props.playing ? '❚❚' : p === N ? '↻' : '▶'}
          </button>
          <button onClick={props.onNext} disabled={p === N} title="Next (→)">▶︎</button>
          <button onClick={() => props.onSeek(N)} disabled={p === N} title="Jump to result (End)">⏭</button>
        </div>

        <div className="progress">
          <input
            type="range"
            min={0}
            max={N}
            value={p}
            onChange={(e) => props.onSeek(Number(e.target.value))}
            aria-label="Step"
          />
          <span className="progress-text">
            {p === 0 ? 'Start' : `Step ${p} / ${N}`}
            {step && (
              <span className="muted">
                {' '}· k={name(step.k)} i={name(step.i)} j={name(step.j)}
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="controls-row">
        <label className="field">
          <span>Stop at</span>
          <select value={props.granularity} onChange={(e) => { props.onGranularity(e.target.value as Granularity); e.target.blur(); }}>
            {(Object.keys(GRANULARITY_LABELS) as Granularity[]).map((g) => (
              <option key={g} value={g}>{GRANULARITY_LABELS[g]}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Speed</span>
          <input
            type="range"
            min={0.5}
            max={8}
            step={0.5}
            value={props.speed}
            onChange={(e) => props.onSpeed(Number(e.target.value))}
          />
          <span className="muted mono">{props.speed}/s</span>
        </label>

        <div className="field rounds">
          <span>Round</span>
          <div className="btn-group small">
            {graph.nodes.map((nd, k) => (
              <button
                key={nd.id}
                className={props.currentK === k ? 'active' : ''}
                onClick={() => jumpToRound(k)}
                title={`Jump to round k = ${nd.id}`}
              >
                {nd.id}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
