# Adding your own graph

Every `.json` file in this folder automatically shows up in the dataset menu on the page.
Files that start with `_` (like `_template.json`) are skipped.

## Quick start

1. Copy `_template.json` and rename it, e.g. `my-example.json` (lowercase, no spaces).
2. Edit the nodes and edges.
3. **Preview it before submitting:** open the site and drag your file onto the page
   (or click **Load file…**). If something is wrong, the page lists the problems.
4. Submit it with a pull request (see "Submitting" below).

## Format

```jsonc
{
  "name": "My graph",                  // required: shown in the dataset menu
  "description": "One sentence.",      // optional: shown under the title
  "directed": true,                    // optional, default true. false = every edge goes both ways
  "units": "min",                      // optional: unit shown after distances

  "nodes": [
    // "id" is required and must be unique. Keep it short (1–3 characters fits in the circle).
    // "label" is optional: a longer name shown next to the node.
    // Position: "x"/"y" for the graph view and/or "lat"/"lng" for the map view.
    //   Any units work for x/y (the view auto-fits); y grows downward.
    //   With neither, nodes are placed on a circle.
    { "id": "A", "label": "Alpha", "x": 0, "y": 0 },
    { "id": "B", "x": 2, "y": 0 }
  ],

  "edges": [
    // Weights must be numbers ≥ 0. Each (from, to) pair may appear only once.
    { "from": "A", "to": "B", "weight": 4 }
  ],

  "scenarios": [
    // Optional one-click "what if" buttons. Applying one shows the result next to the original.
    { "name": "Remove A → B", "description": "Optional", "removeEdges": [["A", "B"]] },
    { "name": "Add B → A", "addEdges": [{ "from": "B", "to": "A", "weight": 1 }] }
  ]
}
```

(The real file must be plain JSON: no `//` comments.)

### Several weights per edge (e.g. morning vs evening traffic)

Declare the profiles once, then give every edge one number per profile. The page shows a
switch for them. See `bayarea7.json`.

```json
"weightProfiles": [
  { "id": "am_peak", "label": "Morning peak" },
  { "id": "pm_peak", "label": "Evening peak" }
],
"edges": [
  { "from": "SJ", "to": "SF", "weight": { "am_peak": 75, "pm_peak": 50 } }
]
```

## Submitting

You don't need git:

1. On GitHub, open this repo's `data/` folder and click **Add file → Upload files**.
2. Drop your `.json` file in and choose **Create a new branch and start a pull request**.
   GitHub makes a copy (fork) of the repo for you automatically.
3. Open the pull request. An automatic check validates your file; if it fails, the log
   says exactly what's wrong.
4. Once it's reviewed and merged, it appears on the live site within a few minutes.
