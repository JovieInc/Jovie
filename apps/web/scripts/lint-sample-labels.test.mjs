import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectSampleLabelSources,
  lintSampleLabels,
} from './lint-sample-labels.mjs';

describe('sample-label lint (JOV-13067)', () => {
  /** @type {string | undefined} */
  let fixtureRoot;

  afterEach(() => {
    if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
  });

  /** @returns {{ root: string, scanRoot: string }} */
  function makeFixture() {
    const root = mkdtempSync(join(tmpdir(), 'sample-labels-'));
    const scanRoot = join(root, 'components/marketing');
    mkdirSync(scanRoot, { recursive: true });
    fixtureRoot = root;
    return { root, scanRoot };
  }

  it('flags a Find me CTA file with no example labeling', () => {
    const { root, scanRoot } = makeFixture();
    writeFileSync(
      join(scanRoot, 'Hero.tsx'),
      "<button type='button'>Find me</button>\n"
    );
    /** @type {string[]} */
    const out = [];
    const result = lintSampleLabels({
      webRoot: root,
      scanRoots: [join(root, 'components')],
      log: (...lines) => out.push(lines.join(' ')),
    });
    expect(result.code).toBe(0);
    expect(out.join('\n')).toContain('components/marketing/Hero.tsx:1');
  });

  it('passes a Find me CTA that carries an example/sample label', () => {
    const { root, scanRoot } = makeFixture();
    writeFileSync(
      join(scanRoot, 'Hero.tsx'),
      "<span>View example profile</span>\n<button type='button'>Find me</button>\n"
    );
    const result = lintSampleLabels({
      args: ['--strict'],
      webRoot: root,
      scanRoots: [join(root, 'components')],
      error: () => {},
    });
    expect(result.code).toBe(0);
  });

  it('emits JSON with --json and fails --strict on hits', () => {
    const { root, scanRoot } = makeFixture();
    writeFileSync(join(scanRoot, 'Hero.tsx'), 'Find me\n');
    /** @type {string[]} */
    const out = [];
    lintSampleLabels({
      args: ['--json'],
      webRoot: root,
      scanRoots: [join(root, 'components')],
      log: (...lines) => out.push(lines.join(' ')),
    });
    expect(JSON.parse(out.join('')).hits).toHaveLength(1);
    const strict = lintSampleLabels({
      args: ['--strict'],
      webRoot: root,
      scanRoots: [join(root, 'components')],
      error: () => {},
    });
    expect(strict.code).toBe(1);
  });

  it('picks up homepage copy data files by glob', () => {
    const root = mkdtempSync(join(tmpdir(), 'sample-labels-data-'));
    fixtureRoot = root;
    mkdirSync(join(root, 'data'), { recursive: true });
    writeFileSync(
      join(root, 'data', 'homepageSearchCopy.ts'),
      "export const copy = { action: 'Find me' };\n"
    );
    const files = collectSampleLabelSources(root).map(p => p.split('/').pop());
    expect(files).toContain('homepageSearchCopy.ts');
  });
});
