import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CANONICAL_LIVE_STORIES,
  validateCanonicalStoryInventory,
} from '../../component-live-storybook-certification.mjs';

const temps = [];
afterEach(() => {
  for (const root of temps.splice(0))
    rmSync(root, { recursive: true, force: true });
});
describe('run-scoped canonical story inventory', () => {
  it('rereads story source between runs so edits cannot reuse an old inventory pass', () => {
    const root = mkdtempSync(join(tmpdir(), 'live-sb-fresh-'));
    temps.push(root);

    mkdirSync(join(root, 'packages/ui/atoms'), { recursive: true });
    const story = CANONICAL_LIVE_STORIES[0];
    const file = join(root, story.importPath);
    writeFileSync(
      file,
      "const meta = { title: 'UI/Atoms/Badge' };\nexport const Default = {};\n"
    );
    const options = { repoRoot: root, stories: [story], allowSubset: true };
    expect(validateCanonicalStoryInventory(options).ok).toBe(true);
    writeFileSync(
      file,
      "const meta = { title: 'UI/Atoms/Badge' };\nexport const Renamed = {};\n"
    );
    expect(validateCanonicalStoryInventory(options).issues.join('\n')).toMatch(
      /Default is not declared/
    );
  });
});
