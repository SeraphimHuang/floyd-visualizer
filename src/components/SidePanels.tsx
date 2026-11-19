import { describeOp, formatWeight } from '../core/graph';
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
  onClear: () => void;
}) {
  const { graph, src, tgt, path } = props;
  const id = (i: number) => graph.nodes[i].id;
  const u = graph.units;
  return (
    <div className="card">
      <div className="card-title">
        <span>Shortest path</span>
        {src !== null && <button className="link" onClick={props.onClear}>clear</button>}
      </div>
      {src === null ? (
        <p className="muted">Click two nodes (or a matrix cell) to see the best path between them.</p>
      ) : tgt === null ? (
        <p className="muted">From <b>{id(src)}</b>. Now click the destination.</p>
      ) : (
        <>
          <div className="path-line">
            {path ? path.map(id).join(' → ') : `No path from ${id(src)} to ${id(tgt)} yet`}
          </div>
          {props.dist !== null && props.dist !== Infinity && (
            <div className="path-dist">
              {formatWeight(props.dist, u)}
              {props.baselineDist !== null && props.baselineDist !== props.dist && (
                <span className={props.dist > props.baselineDist ? 'worse' : 'better'}>
                  {' '}(was {formatWeight(props.baselineDist, u)},{' '}
                  {props.dist > props.baselineDist ? '+' : '−'}
                  {formatWeight(Math.abs(props.dist - props.baselineDist), u)})
                </span>
              )}
            </div>
          )}
          {!props.isFinal && (
            <p className="muted small">Best path found so far. It may still improve in later rounds.</p>
          )}
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
  const w = Number(draft.weight);
  const validWeight = draft.weight.trim() !== '' && Number.isFinite(w) && w >= 0;
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
          <p className="muted small">Click two nodes, or click an edge, then set its weight.</p>
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
              placeholder="weight"
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
