import type { NegativeCycle } from '../core/floyd';
import { describeOp, formatLogWeight, formatRate, formatWeight, weightToRate } from '../core/graph';
import type { EditOp, Graph, Scenario } from '../core/types';

// ---------- Shortest path query ----------

export function PathPanel(props: {
  graph: Graph;
  src: number | null;
  tgt: number | null;
  path: number[] | null;
  dist: number | null;
  baselineDist: number | null;
  isFinal: boolean;
  /** An arbitrage loop exists right now, so "best" values near it are not meaningful. */
  hasArbitrage: boolean;
  onClear: () => void;
}) {
  const { graph, src, tgt, path } = props;
  const exchange = graph.mode === 'exchange';
  const id = (i: number) => graph.nodes[i].id;
  const u = graph.units;
  return (
    <div className="card">
      <div className="card-title">
        <span>{exchange ? 'Best route' : 'Shortest path'}</span>
        {src !== null && <button className="link" onClick={props.onClear}>clear</button>}
      </div>
      {src === null ? (
        <p className="muted">Click two nodes (or a matrix cell) to see the best {exchange ? 'route' : 'path'} between them.</p>
      ) : tgt === null ? (
        <p className="muted">From <b>{id(src)}</b>. Now click the destination.</p>
      ) : (
        <>
          <div className="path-line">
            {path ? path.map(id).join(' → ') : `No path from ${id(src)} to ${id(tgt)}${props.isFinal ? '' : ' yet'}`}
          </div>
          {exchange ? (
            <ExchangeRate graph={graph} src={src} tgt={tgt} dist={props.dist} baseline={props.baselineDist} />
          ) : (
            <PathDistance dist={props.dist} baseline={props.baselineDist} units={u} />
          )}
          {props.hasArbitrage ? (
            <p className="muted small">
              An arbitrage loop exists, so routes that can pass through it have no true "best" (it keeps growing).
              This is the value the algorithm recorded.
            </p>
          ) : (
            !props.isFinal && (
              <p className="muted small">Best found so far. It may still improve in later rounds.</p>
            )
          )}
        </>
      )}
    </div>
  );
}

function PathDistance({ dist, baseline, units }: { dist: number | null; baseline: number | null; units: string }) {
  if (dist === null) return null;
  const fmt = (x: number) => formatWeight(x, units);
  let change: React.ReactNode = null;
  if (baseline !== null && baseline !== dist) {
    const worse = dist > baseline;
    const text =
      dist === Infinity ? `was ${fmt(baseline)}, now unreachable`
      : baseline === Infinity ? 'was unreachable'
      : `was ${fmt(baseline)}, ${worse ? '+' : '−'}${fmt(Math.abs(dist - baseline))}`;
    change = <span className={worse ? 'worse' : 'better'}> ({text})</span>;
  }
  if (dist === Infinity && !change) return null;
  return (
    <div className="path-dist">
      {dist !== Infinity && fmt(dist)}
      {change}
    </div>
  );
}

function ExchangeRate(props: { graph: Graph; src: number; tgt: number; dist: number | null; baseline: number | null }) {
  const { graph, src, tgt, dist, baseline } = props;
  if (dist === null || dist === Infinity) return null;
  const rate = weightToRate(dist);
  const id = (i: number) => graph.nodes[i].id;
  let change: React.ReactNode = null;
  if (baseline !== null && baseline !== dist) {
    const worse = dist > baseline;
    change = (
      <span className={worse ? 'worse' : 'better'}>
        {' '}(was {baseline === Infinity ? 'not possible' : formatRate(weightToRate(baseline))})
      </span>
    );
  }
  return (
    <div className="path-dist">
      1 {id(src)} → {formatRate(rate)} {id(tgt)}
      {change}
    </div>
  );
}

// ---------- Arbitrage (negative cycles) ----------

export function ArbitragePanel(props: {
  graph: Graph;
  cycles: NegativeCycle[];
  /** Nodes whose dist[i][i] is negative right now, with that value. */
  flagged: { node: number; w: number }[];
  selected: number;
  isFinal: boolean;
  onSelect: (i: number) => void;
}) {
  const { graph, cycles } = props;
  const id = (i: number) => graph.nodes[i].id;
  return (
    <div className={`card arbitrage-card${cycles.length ? ' found' : ''}`}>
      <div className="card-title">
        <span>Arbitrage</span>
        {cycles.length > 0 && <span className="badge badge-arb">{cycles.length} loop{cycles.length > 1 ? 's' : ''}</span>}
      </div>
      {cycles.length === 0 ? (
        <p className="muted">
          {props.isFinal
            ? 'No loop of trades makes money: every dist[i][i] stayed at 0.'
            : 'Watching the diagonal: if some dist[i][i] drops below 0, a loop of trades makes money.'}
        </p>
      ) : (
        <>
        <p className="small flagged-intro">Negative diagonal = negative cycle = arbitrage:</p>
        <div className="flagged">
          {props.flagged.map(({ node, w }) => (
            <div key={node} className="flag">
              <span className="mono">dist[{id(node)}][{id(node)}] = <b className="neg">{formatLogWeight(w)}</b> &lt; 0</span>
              <span className="muted">rate {formatRate(weightToRate(w))} &gt; 1</span>
            </div>
          ))}
        </div>
        <div className="cycle-list">
          {cycles.map((c, i) => {
            const gain = weightToRate(c.weight);
            const start = id(c.nodes[0]);
            return (
              <button
                key={c.nodes.join(',')}
                className={`cycle${props.selected === i ? ' active' : ''}`}
                onClick={() => props.onSelect(i)}
              >
                <span className="cycle-path">{c.nodes.map(id).join(' → ')}</span>
                <span className="cycle-gain">
                  1 {start} → {formatRate(gain)} {start} <b>(+{((gain - 1) * 100).toFixed(1)}%)</b>
                </span>
              </button>
            );
          })}
        </div>
        <p className="muted small">
          Loops are traced back with the <code>next</code> matrix. When several loops exist they feed into each
          other, so only some of them may be listed.
        </p>
        </>
      )}
    </div>
  );
}

// ---------- Scenarios and compare ----------

export function ScenarioPanel(props: {
  scenarios: Scenario[];
  active: string | null;
  ops: EditOp[];
  showOriginal: boolean;
  onApply: (s: Scenario) => void;
  onReset: () => void;
  onToggleOriginal: () => void;
}) {
  const modified = props.ops.length > 0;
  if (!props.scenarios.length && !modified) return null;
  return (
    <div className="card">
      <div className="card-title">
        <span>Scenarios</span>
        {modified && <button className="link" onClick={props.onReset}>restore original</button>}
      </div>
      {props.scenarios.length > 0 && (
        <div className="scenario-list">
          {props.scenarios.map((s) => (
            <button
              key={s.name}
              className={`scenario${props.active === s.name ? ' active' : ''}`}
              onClick={() => props.onApply(s)}
              title={s.description}
            >
              <b>{s.name}</b>
              {s.description && <span>{s.description}</span>}
            </button>
          ))}
        </div>
      )}
      {modified && (
        <>
          <ul className="ops">
            {props.ops.map((op, i) => <li key={i}>{describeOp(op)}</li>)}
          </ul>
          <div className="seg">
            <button className={!props.showOriginal ? 'active' : ''} onClick={() => props.showOriginal && props.onToggleOriginal()}>
              Modified
            </button>
            <button className={props.showOriginal ? 'active' : ''} onClick={() => !props.showOriginal && props.onToggleOriginal()}>
              Original
            </button>
            <span className="muted small kbd-hint"><kbd>Tab</kbd> to switch</span>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Editing ----------

export interface Draft {
  from: string;
  to: string;
  weight: string;
}

export function EditPanel(props: {
  graph: Graph;
  editMode: boolean;
  draft: Draft;
  existingWeight: number | null;
  onToggle: () => void;
  onDraft: (d: Draft) => void;
  onSet: () => void;
  onRemove: () => void;
  onExport: () => void;
}) {
  const { graph, draft } = props;
  const exchange = graph.mode === 'exchange';
  const w = Number(draft.weight);
  const validWeight = draft.weight.trim() !== '' && Number.isFinite(w) && (exchange ? w > 0 : w >= 0);
  const validPair = draft.from && draft.to && draft.from !== draft.to;
  return (
    <div className="card">
      <div className="card-title">
        <span>Edit graph</span>
        <button className={`toggle${props.editMode ? ' on' : ''}`} onClick={props.onToggle}>
          {props.editMode ? 'Editing' : 'Edit'}
        </button>
      </div>
      {!props.editMode ? (
        <p className="muted">
          Add, remove or re-weight edges. Changes stay in this page; the data file is not touched.
        </p>
      ) : (
        <>
          <p className="muted small">Click two nodes, or click an edge, then set its {exchange ? 'exchange rate' : 'weight'}.</p>
          <div className="edit-form">
            <select value={draft.from} onChange={(e) => props.onDraft({ ...draft, from: e.target.value })}>
              <option value="">from</option>
              {graph.nodes.map((n) => <option key={n.id} value={n.id}>{n.id}</option>)}
            </select>
            <span>→</span>
            <select value={draft.to} onChange={(e) => props.onDraft({ ...draft, to: e.target.value })}>
              <option value="">to</option>
              {graph.nodes.map((n) => <option key={n.id} value={n.id}>{n.id}</option>)}
            </select>
            <input
              type="number"
              min={0}
              step="any"
              placeholder={exchange ? 'rate' : 'weight'}
              value={draft.weight}
              onChange={(e) => props.onDraft({ ...draft, weight: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && validPair && validWeight && props.onSet()}
            />
          </div>
          <div className="edit-actions">
            <button className="primary" disabled={!validPair || !validWeight} onClick={props.onSet}>
              {props.existingWeight !== null ? 'Update edge' : 'Add edge'}
            </button>
            <button className="danger" disabled={props.existingWeight === null} onClick={props.onRemove}>
              Remove edge
            </button>
          </div>
        </>
      )}
      <button className="link export" onClick={props.onExport}>Export current graph as JSON</button>
    </div>
  );
}
