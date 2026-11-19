// ---------- The JSON file format (what people put in data/) ----------

export interface GraphNode {
  id: string;
  label?: string;
  /** Position for the plain graph view (any units; the view auto-fits). */
  x?: number;
  y?: number;
  /** Position for the map view. */
  lat?: number;
  lng?: number;
}

/** A single number, or one number per weight profile, e.g. { "am_peak": 40, "pm_peak": 25 }. */
export type WeightSpec = number | Record<string, number>;

export interface FileEdge {
  from: string;
  to: string;
  weight: WeightSpec;
}

export interface WeightProfile {
  id: string;
  label: string;
}

export interface Scenario {
  name: string;
  description?: string;
  /** Pairs of [from, to]. */
  removeEdges?: [string, string][];
  /** New edges, or new weights for existing edges. */
  addEdges?: FileEdge[];
}

export interface GraphFile {
  name: string;
  description?: string;
  /** Defaults to true. If false, every edge is used in both directions. */
  directed?: boolean;
  /** Unit shown after weights, e.g. "min". */
  units?: string;
  weightProfiles?: (string | WeightProfile)[];
  nodes: GraphNode[];
  edges: FileEdge[];
  scenarios?: Scenario[];
}

// ---------- In-app representation ----------

/** An edit applied on top of the file's edges (by node id). */
export type EditOp =
  | { type: 'remove'; from: string; to: string }
  | { type: 'set'; from: string; to: string; weight: WeightSpec };

/** Edge between node indices with a resolved numeric weight. */
export interface Edge {
  from: number;
  to: number;
  weight: number;
}

export interface Graph {
  nodes: GraphNode[];
  edges: Edge[];
  units: string;
}
