import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateGraphFile } from './validate';

// Every file in data/ (including _template.json) must follow the format.
// This runs automatically on every pull request.
const dataDir = join(__dirname, '../../data');
const files = readdirSync(dataDir).filter((f) => f.endsWith('.json'));

describe('data/ files', () => {
  it('has at least one file', () => expect(files.length).toBeGreaterThan(0));

  for (const f of files) {
    it(`${f} is valid`, () => {
      let raw: unknown;
      expect(() => (raw = JSON.parse(readFileSync(join(dataDir, f), 'utf8'))), 'not valid JSON').not.toThrow();
      expect(validateGraphFile(raw)).toEqual([]);
    });
  }
});

describe('validateGraphFile', () => {
  it('reports missing nodes and negative weights', () => {
    const errors = validateGraphFile({
      name: 'bad',
      nodes: [{ id: 'A' }],
      edges: [{ from: 'A', to: 'Z', weight: -1 }],
    });
    expect(errors.some((e) => e.includes('"Z" does not exist'))).toBe(true);
    expect(errors.some((e) => e.includes('negative'))).toBe(true);
  });

  it('requires every profile weight when profiles are declared', () => {
    const errors = validateGraphFile({
      name: 'p',
      weightProfiles: ['am', 'pm'],
      nodes: [{ id: 'A' }, { id: 'B' }],
      edges: [{ from: 'A', to: 'B', weight: { am: 3 } }],
    });
    expect(errors).toEqual(['Edge A → B: missing weight for profile "pm".']);
  });
});
