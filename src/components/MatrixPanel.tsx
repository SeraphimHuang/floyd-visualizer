import type { Step } from '../core/floyd';
import { NEGATIVE_EPS } from '../core/floyd';
import type { Graph } from '../core/types';

interface Props {
  graph: Graph;
  dist: number[][];
  /** The comparison that was just made (null at the start or in round mode). */
  step: Step | null;
  /** Position, used to restart the flash animation on every step. */
  p: number;
  k: number | null;
  /** Final distances of the original graph: when set, cells show old → new. */
  diffAgainst: number[][] | null;
  query: [number, number] | null;
  /** Formats a dist value (exchange graphs can show rates). */
  fmt: (w: number) => string;
  /** Label for the card, e.g. "dist matrix" or "best rate matrix". */
  title: string;
  onCellClick: (i: number, j: number) => void;
}

export function MatrixPanel({ graph, dist, step, p, k, diffAgainst, query, fmt, title, onCellClick }: Props) {
  const formatWeight = fmt;
  const ids = graph.nodes.map((n) => n.id);
  const changedCount = diffAgainst
    ? dist.reduce((s, row, i) => s + row.filter((v, j) => v !== diffAgainst[i][j]).length, 0)
    : 0;

  return (
    <div className="card matrix-card">
      <div className="card-title">
        <span>{title}</span>
        {diffAgainst && (
          <span className="badge badge-diff">
            {changedCount} cell{changedCount === 1 ? '' : 's'} changed vs original
          </span>
        )}
      </div>
      <div className="matrix-scroll">
        <table className={`matrix${ids.length > 6 || graph.mode === 'exchange' ? ' compact' : ''}`}>
          <thead>
            <tr>
              <th className="corner" title="row = from, column = to">from \ to</th>
              {ids.map((id, j) => (
                <th key={id} className={k === j ? 'col-k-head' : ''}>{id}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dist.map((row, i) => (
              <tr key={ids[i]}>
                <th className={k === i ? 'row-k-head' : ''}>{ids[i]}</th>
                {row.map((v, j) => {
                  const cls = ['cell'];
                  if (k !== null && (i === k || j === k)) cls.push('in-k');
                  if (i === j) cls.push(v < -NEGATIVE_EPS ? 'arbitrage' : 'diag');
                  let content: React.ReactNode = formatWeight(v);

                  if (step && !step.trivial) {
                    if (i === step.i && j === step.k) cls.push('is-ik');
                    if (i === step.k && j === step.j) cls.push('is-kj');
                  }
                  if (step && i === step.i && j === step.j) {
                    cls.push('is-ij');
                    if (step.updated) {
                      cls.push('updated');
                      content = (
                        <>
                          <s className="old">{formatWeight(step.before)}</s> {formatWeight(v)}
                        </>
                      );
                    }
                  }
                  if (diffAgainst && diffAgainst[i][j] !== v) {
                    cls.push(v > diffAgainst[i][j] ? 'diff-worse' : 'diff-better');
                    content = (
                      <>
                        <s className="old">{formatWeight(diffAgainst[i][j])}</s>
                        {formatWeight(v)}
                      </>
                    );
                  }
                  if (query && query[0] === i && query[1] === j) cls.push('is-query');
                  return (
                    <td
                      // Changing the key on update replays the flash animation.
                      key={step?.updated && i === step.i && j === step.j ? `${ids[j]}-${p}` : ids[j]}
                      className={cls.join(' ')}
                      onClick={() => onCellClick(i, j)}
                      title={`dist[${ids[i]}][${ids[j]}] · click to show the path`}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {step && !step.trivial && (
        <div className="matrix-legend">
          <span className="sw sw-ik" /> dist[i][k]
          <span className="sw sw-kj" /> dist[k][j]
          <span className="sw sw-ij" /> dist[i][j]
        </div>
      )}
    </div>
  );
}
