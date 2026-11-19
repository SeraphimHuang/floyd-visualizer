# Floyd-Warshall Visualizer

Interactive, step-by-step visualization of the Floyd-Warshall all-pairs shortest path algorithm.
CS5800 final project.

## 👉 Live site: https://seraphimhuang.github.io/floyd-visualizer/

| Demo | Link |
| --- | --- |
| 4-node step-by-step example | [?data=toy4](https://seraphimhuang.github.io/floyd-visualizer/?data=toy4) |
| Bay Area commute on a map | [?data=bayarea7&view=map](https://seraphimhuang.github.io/floyd-visualizer/?data=bayarea7&view=map) |
| Cute coin arbitrage (negative cycles) | [?data=cute-coins](https://seraphimhuang.github.io/floyd-visualizer/?data=cute-coins) |

Any dataset in `data/` opens directly with `?data=<file name without .json>`. New datasets appear on
the site a few minutes after their pull request is merged.

## ➕ Add your own dataset (no git needed)

1. Copy [`data/_template.json`](data/_template.json), rename it (e.g. `my-graph.json`), and edit the nodes and edges.
2. **Preview it**: open the live site and drag your file onto the page. Mistakes are listed clearly.
3. On GitHub, open the [`data/`](data/) folder → **Add file → Upload files** → drop your file →
   **Create a new branch and start a pull request**.
4. An automatic check validates the file. Once the pull request is merged, it's on the site.

Full file format (positions, map coordinates, morning/evening weights, exchange rates, scenarios):
[`data/README.md`](data/README.md).

- **Step through the algorithm**: every comparison `dist[i][k] + dist[k][j] < dist[i][j]?`
  is shown on the graph, in the matrix, and in a one-line explanation.
- **Any graph**: drop a JSON file in [`data/`](data/README.md) and it appears in the menu.
- **What-if scenarios**: remove, add or re-weight edges and compare with the original.
- **Map view**: graphs with `lat`/`lng` can be shown on a real map (free tiles, no API key).
- **Arbitrage**: exchange-rate graphs run on `−ln(rate)`; a negative cycle (some `dist[i][i] < 0`)
  is a loop of trades that makes money, and the page traces and highlights it.

## Using it

| Key | Action |
| --- | --- |
| `←` / `→` | Previous / next step |
| `Space` | Play / pause |
| `Home` / `End` | Start / final result |
| `Tab` | Switch between the modified and the original graph |
| `Esc` | Clear the selection |

- **Stop at** controls how detailed the steps are: every comparison (n³), only the useful
  ones (skips i = k, j = k, i = j), only the ones that change the matrix, or one round per k.
- Click two nodes, or a matrix cell, to see the current best path between them.
- Open a dataset directly with `?data=<file name>`, e.g. `?data=bayarea7&view=map`.

## Development

Requires Node.js 20+.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # algorithm tests + validates every file in data/
npm run build    # production build in dist/
```

### Layout

```
data/                    graph files (one per dataset)
src/core/                no UI code; everything here is unit-tested
  floyd.ts               the algorithm, recorded as a list of steps
  graph.ts               file → graph, weight profiles, edits
  narrate.ts             the explanation sentence for each step
  validate.ts            data-file checks with readable errors
src/components/
  GraphCanvas.tsx        SVG drawing shared by both views
  GraphView.tsx          plain view (x/y positions)
  MapView.tsx            Leaflet map + the same SVG drawing on top
  MatrixPanel.tsx, Controls.tsx, SidePanels.tsx
src/App.tsx              state and wiring
```

The algorithm runs once and records every comparison; the player only moves an index through
that list, so stepping backwards and jumping around are free.

## Contributing

Changes go in through pull requests, reviewed before merging. To add a dataset you don't need git at
all, see [`data/README.md`](data/README.md). Every pull request automatically validates the
data files and runs the tests.

## Deployment

Every push to `main` builds and publishes the site to GitHub Pages
(`.github/workflows/deploy.yml`).
