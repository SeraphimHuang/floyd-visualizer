import type { GraphFile } from './types';

/**
 * Checks a parsed JSON value against the data format described in data/README.md.
 * Returns a list of human-readable problems (empty = valid).
 */
export function validateGraphFile(raw: unknown): string[] {
  const errors: string[] = [];
  const isObj = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

  if (!isObj(raw)) return ['The file must contain a JSON object ({ ... }).'];
  const f = raw as Partial<GraphFile> & Record<string, unknown>;

  if (typeof f.name !== 'string' || !f.name.trim()) errors.push('Missing "name" (a string).');
  if (f.directed !== undefined && typeof f.directed !== 'boolean')
    errors.push('"directed" must be true or false.');
  if (f.units !== undefined && typeof f.units !== 'string') errors.push('"units" must be a string.');

  // Weight profiles
  const profileIds: string[] = [];
  if (f.weightProfiles !== undefined) {
    if (!Array.isArray(f.weightProfiles) || f.weightProfiles.length === 0) {
      errors.push('"weightProfiles" must be a non-empty list.');
    } else {
      f.weightProfiles.forEach((p, i) => {
        if (typeof p === 'string') profileIds.push(p);
        else if (isObj(p) && typeof p.id === 'string' && typeof p.label === 'string') profileIds.push(p.id);
        else errors.push(`weightProfiles[${i}] must be a string or { "id": ..., "label": ... }.`);
      });
    }
  }

  // Nodes
  const ids = new Set<string>();
  if (!Array.isArray(f.nodes) || f.nodes.length === 0) {
    errors.push('"nodes" must be a non-empty list.');
  } else {
    f.nodes.forEach((n, i) => {
      if (!isObj(n) || typeof n.id !== 'string' || !n.id) {
        errors.push(`nodes[${i}] needs an "id" (a string).`);
        return;
      }
      if (ids.has(n.id)) errors.push(`Node id "${n.id}" is used more than once.`);
      ids.add(n.id);
      const hasX = n.x !== undefined, hasY = n.y !== undefined;
      if (hasX !== hasY || (hasX && (!isNum(n.x) || !isNum(n.y))))
        errors.push(`Node "${n.id}": "x" and "y" must both be numbers.`);
      const hasLat = n.lat !== undefined, hasLng = n.lng !== undefined;
      if (hasLat !== hasLng || (hasLat && (!isNum(n.lat) || !isNum(n.lng))))
        errors.push(`Node "${n.id}": "lat" and "lng" must both be numbers.`);
    });
  }

  const checkWeight = (w: unknown, where: string) => {
    if (isNum(w)) {
      if (w < 0) errors.push(`${where}: weight ${w} is negative (negative weights are not supported).`);
      return;
    }
    if (isObj(w)) {
      if (profileIds.length === 0) {
        errors.push(`${where}: per-profile weights need "weightProfiles" at the top of the file.`);
        return;
      }
      for (const pid of profileIds) {
        if (!(pid in w)) errors.push(`${where}: missing weight for profile "${pid}".`);
        else if (!isNum(w[pid]) || (w[pid] as number) < 0)
          errors.push(`${where}: weight for "${pid}" must be a non-negative number.`);
      }
      for (const k of Object.keys(w))
        if (!profileIds.includes(k)) errors.push(`${where}: unknown profile "${k}".`);
      return;
    }
    errors.push(`${where}: "weight" must be a number or { "<profile>": number, ... }.`);
  };

  const checkEnds = (from: unknown, to: unknown, where: string) => {
    for (const [name, v] of [['from', from], ['to', to]] as const) {
      if (typeof v !== 'string') errors.push(`${where}: "${name}" must be a node id.`);
      else if (ids.size && !ids.has(v)) errors.push(`${where}: node "${v}" does not exist.`);
    }
    if (from === to && typeof from === 'string') errors.push(`${where}: self-loops are not allowed.`);
  };

  // Edges
  if (!Array.isArray(f.edges)) {
    errors.push('"edges" must be a list (it can be empty).');
  } else {
    const seen = new Set<string>();
    f.edges.forEach((e, i) => {
      if (!isObj(e)) return errors.push(`edges[${i}] must be an object.`);
      const where = `Edge ${String(e.from)} → ${String(e.to)}`;
      checkEnds(e.from, e.to, where);
      checkWeight(e.weight, where);
      const k = `${e.from}->${e.to}`;
      if (seen.has(k)) errors.push(`${where} appears more than once.`);
      seen.add(k);
    });
  }

  // Scenarios
  if (f.scenarios !== undefined) {
    if (!Array.isArray(f.scenarios)) errors.push('"scenarios" must be a list.');
    else
      f.scenarios.forEach((s, i) => {
        if (!isObj(s) || typeof s.name !== 'string') {
          errors.push(`scenarios[${i}] needs a "name".`);
          return;
        }
        const where = `Scenario "${s.name}"`;
        if (s.removeEdges !== undefined) {
          if (!Array.isArray(s.removeEdges)) errors.push(`${where}: "removeEdges" must be a list of [from, to].`);
          else
            s.removeEdges.forEach((pair) => {
              if (!Array.isArray(pair) || pair.length !== 2)
                errors.push(`${where}: each removeEdges entry must be [from, to].`);
              else checkEnds(pair[0], pair[1], `${where}, remove ${pair[0]} → ${pair[1]}`);
            });
        }
        if (s.addEdges !== undefined) {
          if (!Array.isArray(s.addEdges)) errors.push(`${where}: "addEdges" must be a list of edges.`);
          else
            s.addEdges.forEach((e) => {
              if (!isObj(e)) return errors.push(`${where}: addEdges entries must be objects.`);
              const w = `${where}, add ${String(e.from)} → ${String(e.to)}`;
              checkEnds(e.from, e.to, w);
              checkWeight(e.weight, w);
            });
        }
      });
  }

  return errors;
}
