import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadRepoDatasets, parseLocalFile, type Dataset } from './core/datasets';
import {
  findNegativeCycles, isRoundEnd, reconstructPath, runFloyd, stateAt, stopsFor, type Granularity,
} from './core/floyd';
import {
  buildGraph, exportGraph, getProfiles, scenarioOps, valueFormatter, weightToRate, type Display,
} from './core/graph';
import { narrate } from './core/narrate';
import type { EditOp, Graph, Scenario } from './core/types';
import { Controls } from './components/Controls';
import { edgeKey, NO_HIGHLIGHT, type Highlight } from './components/GraphCanvas';
import { GraphView } from './components/GraphView';
import { MapView } from './components/MapView';
import { MatrixPanel } from './components/MatrixPanel';
import { ArbitragePanel, EditPanel, PathPanel, ScenarioPanel, type Draft } from './components/SidePanels';

const REPO_DATASETS = loadRepoDatasets();
type View = 'graph' | 'map';
type Theme = 'dark' | 'light';

const urlParams = new URLSearchParams(window.location.search);

function initialDatasetId(list: Dataset[]): string {
  const wanted = urlParams.get('data');
  const match = !wanted ? undefined : list.find((d) => d.fileName.replace(/\.json$/, '') === wanted.replace(/\.json$/, ''));
  return (match ?? list.find((d) => d.fileName === 'toy4.json') ?? list[0])?.id ?? '';
}

const hasLatLng = (g: Graph | null) =>
  !!g && g.nodes.every((n) => n.lat !== undefined && n.lng !== undefined);

function readStored<T extends string>(key: string, allowed: T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [datasets, setDatasets] = useState<Dataset[]>(REPO_DATASETS);
  const [dsId, setDsId] = useState(() => initialDatasetId(REPO_DATASETS));
  const [profileId, setProfileId] = useState<string | null>(null);
  const [ops, setOps] = useState<EditOp[]>([]);
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [p, setP] = useState(0);
  const [granularity, setGranularity] = useState<Granularity>('pairs');
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1.5);
  const [query, setQuery] = useState<{ src: number | null; tgt: number | null }>({ src: null, tgt: null });
  const [editMode, setEditMode] = useState(false);
  /** Exchange graphs: show rates (default) or the −ln weights the algorithm adds up. */
  const [display, setDisplay] = useState<Display>('rate');
  /** Which arbitrage loop to highlight, and whether the user pinned it while stepping. */
  const [cycleIndex, setCycleIndex] = useState(0);
  const [cyclePinned, setCyclePinned] = useState(false);
  const [draft, setDraft] = useState<Draft>({ from: '', to: '', weight: '' });
  const [view, setView] = useState<View>(urlParams.get('view') === 'map' ? 'map' : 'graph');
  const [theme, setTheme] = useState<Theme>(() => readStored('fw-theme', ['dark', 'light'], 'light'));
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // ---------- Derived data ----------
  const dataset = datasets.find((d) => d.id === dsId) ?? null;
  const file = dataset?.file ?? null;
  const profiles = useMemo(() => (file ? getProfiles(file) : []), [file]);
  const profile = profiles.find((pr) => pr.id === profileId) ?? profiles[0] ?? null;

  const originalGraph = useMemo(() => (file ? buildGraph(file, profile?.id ?? null) : null), [file, profile]);
  const editedGraph = useMemo(() => (file ? buildGraph(file, profile?.id ?? null, ops) : null), [file, profile, ops]);
  const modified = ops.length > 0;
  const graph = modified && !showOriginal ? editedGraph : originalGraph;

  const trace = useMemo(() => (graph ? runFloyd(graph) : null), [graph]);
  const originalTrace = useMemo(() => (originalGraph ? runFloyd(originalGraph) : null), [originalGraph]);
  const N = trace?.steps.length ?? 0;
  const pos = Math.min(p, N);
  const isFinal = pos === N;
  const stops = useMemo(() => (trace ? stopsFor(trace, granularity) : [0]), [trace, granularity]);
  const state = useMemo(() => (trace ? stateAt(trace, pos) : null), [trace, pos]);
  const originalFinal = useMemo(
    () => (originalTrace ? stateAt(originalTrace, originalTrace.steps.length) : null),
    [originalTrace],
  );
  const roundsMode = granularity === 'rounds';
  const step = trace && pos > 0 ? trace.steps[pos - 1] : null;
  const atRoundSummary = !!trace && roundsMode && isRoundEnd(trace, pos);
  const comparing = modified && !showOriginal && isFinal;

  // ---------- Navigation ----------
  const seek = useCallback((target: number) => setP(Math.max(0, Math.min(N, target))), [N]);
  const next = useCallback(() => {
    const s = stops.find((x) => x > pos);
    if (s !== undefined) setP(s);
  }, [stops, pos]);
  const prev = useCallback(() => {
    const s = [...stops].reverse().find((x) => x < pos);
    if (s !== undefined) setP(s);
  }, [stops, pos]);
  const togglePlay = useCallback(() => {
    if (!playing && pos === N) setP(0);
    setPlaying((x) => !x);
  }, [playing, pos, N]);

  useEffect(() => {
    if (!playing) return;
    if (pos >= N) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(next, 1000 / speed);
    return () => clearTimeout(t);
  }, [playing, pos, N, speed, next]);

  // ---------- Dataset / profile / edits ----------
  const selectDataset = (id: string) => {
    setDsId(id);
    setProfileId(null);
    setOps([]);
    setActiveScenario(null);
    setShowOriginal(false);
    setP(0);
    setPlaying(false);
    setQuery({ src: null, tgt: null });
    setDraft({ from: '', to: '', weight: '' });
    setCycleIndex(0);
    setCyclePinned(false);
    const d = datasets.find((x) => x.id === id);
    if (d?.source === 'repo') {
      const url = new URL(window.location.href);
      url.searchParams.set('data', d.fileName.replace(/\.json$/, ''));
      window.history.replaceState(null, '', url);
    }
  };

  // Map view needs lat/lng; fall back to the graph view otherwise.
  const canMap = hasLatLng(originalGraph);
  const effectiveView: View = view === 'map' && canMap ? 'map' : 'graph';

  const applyOps = (newOps: EditOp[], scenario: string | null) => {
    setOps(newOps);
    setActiveScenario(scenario);
    setShowOriginal(false);
    setPlaying(false);
    setP(Number.MAX_SAFE_INTEGER); // jump to the result so the comparison shows right away
  };
  const applyScenario = (s: Scenario) => applyOps(scenarioOps(s), s.name);
  const resetEdits = () => {
    setOps([]);
    setActiveScenario(null);
    setShowOriginal(false);
  };

  const existingWeight = useMemo(() => {
    if (!editedGraph || !draft.from || !draft.to) return null;
    const ids = editedGraph.nodes.map((n) => n.id);
    const e = editedGraph.edges.find(
      (x) => ids[x.from] === draft.from && ids[x.to] === draft.to,
    );
    if (!e) return null;
    return editedGraph.mode === 'exchange' ? weightToRate(e.weight) : e.weight;
  }, [editedGraph, draft.from, draft.to]);

  const withoutDraftEdge = () => ops.filter((o) => !(o.from === draft.from && o.to === draft.to));
  const setEdge = () => {
    applyOps([...withoutDraftEdge(), { type: 'set', from: draft.from, to: draft.to, weight: Number(draft.weight) }], null);
  };
  const removeEdge = () => {
    applyOps([...withoutDraftEdge(), { type: 'remove', from: draft.from, to: draft.to }], null);
    setDraft({ from: '', to: '', weight: '' });
  };

  const exportJson = () => {
    if (!file || !editedGraph) return;
    const out = exportGraph(file, editedGraph, profile?.label ?? null);
    const blob = new Blob([JSON.stringify(out, null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${dataset!.fileName.replace(/\.json$/, '')}-edited.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // ---------- Local files (button or drag & drop) ----------
  const loadLocal = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    const d = parseLocalFile(f.name, await f.text());
    setDatasets((list) => [...list.filter((x) => x.id !== d.id), d]);
    // selectDataset reads `datasets`, which is stale here; reset state directly.
    setDsId(d.id);
    setProfileId(null);
    setOps([]);
    setActiveScenario(null);
    setShowOriginal(false);
    setP(0);
    setPlaying(false);
    setQuery({ src: null, tgt: null });
  };

  useEffect(() => {
    let depth = 0;
    const isFile = (e: DragEvent) => e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => { if (isFile(e)) { depth++; setDragging(true); } };
    const leave = (e: DragEvent) => { if (isFile(e) && --depth <= 0) { depth = 0; setDragging(false); } };
    const over = (e: DragEvent) => { if (isFile(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!isFile(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      loadLocal(e.dataTransfer!.files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  // ---------- Theme ----------
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('fw-theme', theme); } catch { /* storage unavailable */ }
  }, [theme]);

  // ---------- Keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName) && t.getAttribute('type') !== 'range') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // A focused button would also be "clicked" by Space/Enter on key-up; drop focus first.
      if (t.tagName === 'BUTTON') t.blur();
      switch (e.key) {
        case 'ArrowRight': e.preventDefault(); setPlaying(false); next(); break;
        case 'ArrowLeft': e.preventDefault(); setPlaying(false); prev(); break;
        case ' ': e.preventDefault(); togglePlay(); break;
        case 'Home': e.preventDefault(); setPlaying(false); seek(0); break;
        case 'End': e.preventDefault(); setPlaying(false); seek(N); break;
        case 'Escape': setQuery({ src: null, tgt: null }); setDraft({ from: '', to: '', weight: '' }); setCyclePinned(false); break;
        case 'Tab':
          if (modified) { e.preventDefault(); setShowOriginal((x) => !x); }
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, togglePlay, seek, N, modified]);

  // ---------- Clicks on the drawing ----------
  const onNodeClick = (i: number) => {
    if (!graph) return;
    const id = graph.nodes[i].id;
    if (editMode) {
      if (!draft.from || draft.to) setDraft({ from: id, to: '', weight: '' });
      else if (draft.from !== id) {
        // Second click: prefill the current value if this edge already exists.
        const from = graph.nodes.findIndex((n) => n.id === draft.from);
        setDraft({ from: draft.from, to: id, weight: edgeValueText(from, i) });
      }
      return;
    }
    setQuery((q) =>
      q.src === null || q.tgt !== null ? { src: i, tgt: null } : q.src === i ? { src: null, tgt: null } : { src: q.src, tgt: i },
    );
  };
  /** The current value of edge from → to as the edit form shows it (a rate in exchange mode). */
  const edgeValueText = (from: number, to: number) => {
    const e = editedGraph?.edges.find((x) => x.from === from && x.to === to);
    if (!e) return '';
    return editedGraph!.mode === 'exchange' ? String(Number(weightToRate(e.weight).toPrecision(6))) : String(e.weight);
  };
  const onEdgeClick = (from: number, to: number) => {
    if (!editedGraph) return;
    setDraft({ from: editedGraph.nodes[from].id, to: editedGraph.nodes[to].id, weight: edgeValueText(from, to) });
  };

  // ---------- Highlights ----------
  const queryPath =
    state && query.src !== null && query.tgt !== null ? reconstructPath(state.next, query.src, query.tgt) : null;
  const baselinePath =
    comparing && originalFinal && query.src !== null && query.tgt !== null
      ? reconstructPath(originalFinal.next, query.src, query.tgt)
      : null;

  // Arbitrage loops (negative cycles) visible at the current step.
  const cycles = useMemo(() => {
    if (!graph || !state || graph.mode !== 'exchange') return [];
    const w = new Map(graph.edges.map((e) => [edgeKey(e.from, e.to), e.weight]));
    return findNegativeCycles(state, (u, v) => w.get(edgeKey(u, v)));
  }, [graph, state]);
  const shownCycle =
    cycles.length && queryPath === null && (isFinal || atRoundSummary || cyclePinned)
      ? cycles[Math.min(cycleIndex, cycles.length - 1)].nodes
      : null;
  const fmt = valueFormatter(graph?.mode ?? 'distance', display);

  const hl: Highlight = { ...NO_HIGHLIGHT, querySrc: query.src, queryTgt: query.tgt, query: queryPath, cycle: shownCycle };
  if (comparing && baselinePath && queryPath?.join() !== baselinePath.join()) hl.baseline = baselinePath;
  if (step && state && !isFinal) {
    hl.k = step.k;
    if (!atRoundSummary) {
      hl.i = step.i;
      hl.j = step.j;
      if (!step.trivial && queryPath === null) {
        hl.pathIK = reconstructPath(state.next, step.i, step.k);
        hl.pathKJ = reconstructPath(state.next, step.k, step.j);
      }
    }
  }

  // What the edits changed, for drawing.
  const { removedEdges, changedEdges } = useMemo(() => {
    const removed: { from: number; to: number }[] = [];
    const changed = new Set<string>();
    if (modified && !showOriginal && originalGraph && editedGraph) {
      const orig = new Map(originalGraph.edges.map((e) => [edgeKey(e.from, e.to), e.weight]));
      const now = new Map(editedGraph.edges.map((e) => [edgeKey(e.from, e.to), e.weight]));
      for (const e of originalGraph.edges) if (!now.has(edgeKey(e.from, e.to))) removed.push(e);
      for (const e of editedGraph.edges) if (orig.get(edgeKey(e.from, e.to)) !== e.weight) changed.add(edgeKey(e.from, e.to));
    }
    return { removedEdges: removed, changedEdges: changed };
  }, [modified, showOriginal, originalGraph, editedGraph]);

  const draftIndex = (id: string) => (graph ? graph.nodes.findIndex((n) => n.id === id) : -1);
  const canvasProps = graph && {
    graph,
    hl,
    removedEdges,
    changedEdges,
    editMode,
    selectedEdge:
      editMode && draft.from && draft.to ? ([draftIndex(draft.from), draftIndex(draft.to)] as [number, number]) : null,
    draftFrom: editMode && draft.from && !draft.to ? draftIndex(draft.from) : null,
    formatEdge: fmt,
    onNodeClick,
    onEdgeClick,
    onBackgroundClick: () => (editMode ? setDraft({ from: '', to: '', weight: '' }) : setQuery({ src: null, tgt: null })),
  };

  let narration = graph && trace && state ? narrate(graph, trace, pos, roundsMode, display, state.dist) : null;
  if (narration && comparing && state && originalFinal) {
    const changed = state.dist.reduce(
      (sum, row, i) => sum + row.filter((v, j) => v !== originalFinal.dist[i][j]).length, 0,
    );
    narration = {
      title: `Result with "${activeScenario ?? 'your edits'}"`,
      detail: changed
        ? `${changed} matrix entr${changed > 1 ? 'ies' : 'y'} changed compared with the original graph (colored in the matrix). ` +
          'Press Home to replay the algorithm on this graph, or Tab to flip to the original.'
        : 'No matrix entry changed: the edit did not matter for any pair.',
      tone: 'done',
    };
  }

  // ---------- Render ----------
  const repoSets = datasets.filter((d) => d.source === 'repo');
  const localSets = datasets.filter((d) => d.source === 'local');
  const dsLabel = (d: Dataset) => (d.file ? d.file.name : `${d.fileName} (invalid)`);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            <svg viewBox="0 0 32 32">
              <ellipse cx="16" cy="22" rx="12" ry="7.5" fill="#ffd23f" stroke="#e8ae00" strokeWidth="1.5" />
              <circle cx="12" cy="12" r="6.5" fill="#ffd23f" stroke="#e8ae00" strokeWidth="1.5" />
              <path d="M5.5 12.5 Q1.5 13 2.5 15 Q5 15.5 7 14" fill="#ff8a00" />
              <circle cx="11" cy="10.5" r="1.3" fill="#3d3320" />
              <path d="M19 20 Q23 18 25 21" stroke="#e8ae00" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          </span>
          <h1>Floyd-Warshall <span>Visualizer</span></h1>
        </div>

        <div className="topbar-controls">
          <select className="dataset-select" value={dsId} onChange={(e) => { selectDataset(e.target.value); e.target.blur(); }} aria-label="Dataset">
            <optgroup label="From the repo (data/)">
              {repoSets.map((d) => <option key={d.id} value={d.id}>{dsLabel(d)}</option>)}
            </optgroup>
            {localSets.length > 0 && (
              <optgroup label="Loaded from your computer">
                {localSets.map((d) => <option key={d.id} value={d.id}>{dsLabel(d)}</option>)}
              </optgroup>
            )}
          </select>

          {profiles.length > 0 && (
            <div className="seg" role="group" aria-label="Weight profile">
              {profiles.map((pr) => (
                <button
                  key={pr.id}
                  className={profile?.id === pr.id ? 'active' : ''}
                  onClick={() => { setProfileId(pr.id); setPlaying(false); }}
                >
                  {pr.label}
                </button>
              ))}
            </div>
          )}

          {graph?.mode === 'exchange' && (
            <div className="seg" role="group" aria-label="Show values as">
              <button className={display === 'rate' ? 'active' : ''} onClick={() => setDisplay('rate')} title="Show exchange rates (multiply along a route)">
                Rates
              </button>
              <button className={display === 'weight' ? 'active' : ''} onClick={() => setDisplay('weight')} title="Show the weights −ln(rate) the algorithm adds up">
                −ln weights
              </button>
            </div>
          )}

          <div className="seg" role="group" aria-label="View">
            <button className={effectiveView === 'graph' ? 'active' : ''} onClick={() => setView('graph')}>Graph</button>
            <button
              className={effectiveView === 'map' ? 'active' : ''}
              onClick={() => setView('map')}
              disabled={!canMap}
              title={canMap ? 'Show on a map' : 'This dataset has no lat/lng positions'}
            >
              Map
            </button>
          </div>

          <button onClick={() => fileInput.current?.click()} title="Load a JSON file from your computer (or drag it onto the page)">
            Load file…
          </button>
          <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(e) => { loadLocal(e.target.files); e.target.value = ''; }} />
          <button
            className="icon-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title="Toggle light / dark"
            aria-label="Toggle light or dark theme"
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </header>

      {!file || !graph || !trace || !state || !canvasProps ? (
        <main className="error-main">
          <div className="card error-card">
            <h2>{dataset ? `Can't load ${dataset.fileName}` : 'No dataset found'}</h2>
            {dataset ? (
              <ul>{dataset.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            ) : (
              <p>Add a JSON file to <code>data/</code> or drag one onto this page.</p>
            )}
            <p className="muted">See <code>data/README.md</code> for the file format.</p>
          </div>
        </main>
      ) : (
        <main className="layout">
          <section className="stage">
            <div className="stage-head">
              <div>
                <h2>{file.name}</h2>
                {file.description && <p className="muted">{file.description}</p>}
              </div>
              <div className="legend">
                <span><i className="dot dot-k" />k (via)</span>
                <span><i className="line line-ik" />i ⇝ k</span>
                <span><i className="line line-kj" />k ⇝ j</span>
                <span><i className="line line-query" />selected path</span>
                {comparing && <span><i className="line line-baseline" />original path</span>}
                {shownCycle && <span><i className="line line-cycle" />arbitrage loop</span>}
              </div>
            </div>

            <div className={`canvas-wrap${modified && showOriginal ? ' showing-original' : ''}`}>
              {modified && (
                <div className={`mode-chip${showOriginal ? '' : ' modified'}`}>
                  {showOriginal ? 'Original graph' : activeScenario ?? 'Modified graph'}
                </div>
              )}
              {effectiveView === 'map' ? <MapView {...canvasProps} /> : <GraphView {...canvasProps} />}
            </div>

            {narration && (
              <div className={`narration tone-${narration.tone}`} aria-live="polite">
                <div className="narration-title">{narration.title}</div>
                <div className="narration-detail">{narration.detail}</div>
              </div>
            )}

            <Controls
              graph={graph}
              trace={trace}
              stops={stops}
              p={pos}
              playing={playing}
              speed={speed}
              granularity={granularity}
              currentK={step ? step.k : null}
              onSeek={(x) => { setPlaying(false); seek(x); }}
              onPrev={() => { setPlaying(false); prev(); }}
              onNext={() => { setPlaying(false); next(); }}
              onTogglePlay={togglePlay}
              onSpeed={setSpeed}
              onGranularity={setGranularity}
            />
          </section>

          <aside className="side">
            <MatrixPanel
              graph={graph}
              dist={state.dist}
              step={atRoundSummary || isFinal ? null : step}
              p={pos}
              k={step && !isFinal ? step.k : null}
              diffAgainst={comparing && originalFinal ? originalFinal.dist : null}
              query={query.src !== null && query.tgt !== null ? [query.src, query.tgt] : null}
              fmt={fmt}
              title={graph.mode !== 'exchange' ? 'dist matrix' : display === 'rate' ? 'best rate matrix' : 'dist matrix (−ln rate)'}
              onCellClick={(i, j) => setQuery(i === j ? { src: null, tgt: null } : { src: i, tgt: j })}
            />
            <PathPanel
              graph={graph}
              src={query.src}
              tgt={query.tgt}
              path={queryPath}
              dist={query.src !== null && query.tgt !== null ? state.dist[query.src][query.tgt] : null}
              baselineDist={
                comparing && originalFinal && query.src !== null && query.tgt !== null
                  ? originalFinal.dist[query.src][query.tgt]
                  : null
              }
              isFinal={isFinal}
              hasArbitrage={cycles.length > 0}
              onClear={() => setQuery({ src: null, tgt: null })}
            />
            {graph.mode === 'exchange' && (
              <ArbitragePanel
                graph={graph}
                cycles={cycles}
                flagged={graph.nodes.map((_, i) => i).filter((i) => state.dist[i][i] < -1e-9)}
                selected={shownCycle ? Math.min(cycleIndex, cycles.length - 1) : -1}
                isFinal={isFinal}
                onSelect={(i) => { setCycleIndex(i); setCyclePinned(true); setQuery({ src: null, tgt: null }); }}
              />
            )}
            <ScenarioPanel
              scenarios={file.scenarios ?? []}
              active={activeScenario}
              ops={ops}
              showOriginal={showOriginal}
              onApply={applyScenario}
              onReset={resetEdits}
              onToggleOriginal={() => setShowOriginal((x) => !x)}
            />
            <EditPanel
              graph={graph}
              editMode={editMode}
              draft={draft}
              existingWeight={existingWeight}
              onToggle={() => { setEditMode((x) => !x); setDraft({ from: '', to: '', weight: '' }); }}
              onDraft={setDraft}
              onSet={setEdge}
              onRemove={removeEdge}
              onExport={exportJson}
            />
            <p className="shortcuts muted small">
              <kbd>←</kbd> <kbd>→</kbd> step · <kbd>Space</kbd> play · <kbd>Home</kbd>/<kbd>End</kbd> start/result · <kbd>Esc</kbd> clear
            </p>
          </aside>
        </main>
      )}

      {dragging && (
        <div className="drop-overlay">
          <div>Drop a JSON graph file to load it</div>
        </div>
      )}
    </div>
  );
}
