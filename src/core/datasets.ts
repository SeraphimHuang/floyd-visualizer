import type { GraphFile } from './types';
import { validateGraphFile } from './validate';

export interface Dataset {
  id: string;
  /** File name, e.g. "toy4.json". */
  fileName: string;
  source: 'repo' | 'local';
  file: GraphFile | null;
  errors: string[];
}

export function makeDataset(fileName: string, raw: unknown, source: Dataset['source']): Dataset {
  const errors = validateGraphFile(raw);
  return {
    id: `${source}:${fileName}`,
    fileName,
    source,
    file: errors.length ? null : (raw as GraphFile),
    errors,
  };
}

/**
 * Every data/*.json file in the repo, collected at build time.
 * Files starting with "_" (like _template.json) are skipped.
 */
export function loadRepoDatasets(): Dataset[] {
  const modules = import.meta.glob('/data/*.json', { eager: true, import: 'default' });
  return Object.entries(modules)
    .map(([path, raw]) => ({ fileName: path.split('/').pop()!, raw }))
    .filter(({ fileName }) => !fileName.startsWith('_'))
    .sort((a, b) => a.fileName.localeCompare(b.fileName))
    .map(({ fileName, raw }) => makeDataset(fileName, raw, 'repo'));
}

export function parseLocalFile(fileName: string, text: string): Dataset {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return {
      id: `local:${fileName}`,
      fileName,
      source: 'local',
      file: null,
      errors: [`Not valid JSON: ${(e as Error).message}`],
    };
  }
  return makeDataset(fileName, raw, 'local');
}
