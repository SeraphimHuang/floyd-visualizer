# Floyd-Warshall Visualizer

Interactive, step-by-step visualization of the Floyd-Warshall all-pairs shortest path algorithm.
CS5800 final project.

- **Step through the algorithm**: every comparison `dist[i][k] + dist[k][j] < dist[i][j]?`
  is shown on the graph, in the matrix, and in a one-line explanation.
- **Any graph**: drop a JSON file in [`data/`](data/README.md) and it appears in the menu.
- **What-if scenarios**: remove, add or re-weight edges and compare with the original.
- **Map view**: graphs with `lat`/`lng` can be shown on a real map (free tiles, no API key).

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
