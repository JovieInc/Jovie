import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectMarketingSources,
  lintMarketingTokens,
} from './lint-marketing-tokens.mjs';

/** @returns {{ root: string, scanRoot: string }} */
function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'marketing-tokens-'));
  const scanRoot = join(root, 'components/marketing');
  mkdirSync(scanRoot, { recursive: true });
  return { root, scanRoot };
}

describe('marketing token lint (JOV-13064)', () => {
  /** @type {string | undefined} */
  let fixtureRoot;

  afterEach(() => {
    if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('flags raw 1296, raw container max-widths and Inter headings', () => {
    const { root, scanRoot } = makeFixture();
    fixtureRoot = root;
    writeFileSync(
      join(scanRoot, 'Page.tsx'),
      [
        `<div className='max-w-[1296px]'>`,
        `  <h1 className='font-sans text-4xl'>Title</h1>`,
        `</div>\n`,
      ].join('\n')
    );
    writeFileSync(
      join(scanRoot, 'sheet.css'),
      '.wrap { max-width: 1296px; }\n@media (max-width: 767px) { .x { max-width: 320px; } }\n'
    );
    /** @type {string[]} */
    const out = [];
    const result = lintMarketingTokens({
      webRoot: root,
      scanRoots: [join(root, 'components')],
      log: (...lines) => out.push(lines.join(' ')),
    });
    expect(result.code).toBe(0);
    const text = out.join('\n');
    expect(text).toContain('raw-1296: 2 hits');
    expect(text).toContain('raw-container-max: 2 hits');
    expect(text).toContain('heading-font-sans: 1 hit');
  });

  it('skips media-query breakpoint lines and passes token-compliant trees', () => {
    const { root, scanRoot } = makeFixture();
    fixtureRoot = root;
    writeFileSync(
      join(scanRoot, 'clean.css'),
      '@media (max-width: 767px) { .x { max-width: 320px; } }\n.wrap { max-width: var(--ds-public-content-max); }\n'
    );
    const result = lintMarketingTokens({
      args: ['--strict'],
      webRoot: root,
      scanRoots: [join(root, 'components')],
      error: () => {},
    });
    expect(result.code).toBe(0);
  });

  it('emits JSON with --json and fails --strict on hits', () => {
    const { root, scanRoot } = makeFixture();
    fixtureRoot = root;
    writeFileSync(join(scanRoot, 'P.tsx'), `max-w-[1296px]\n`);
    /** @type {string[]} */
    const out = [];
    lintMarketingTokens({
      args: ['--json'],
      webRoot: root,
      scanRoots: [join(root, 'components')],
      log: (...lines) => out.push(lines.join(' ')),
    });
    const parsed = JSON.parse(out.join(''));
    expect(parsed.hits['raw-1296']).toHaveLength(1);
    const strict = lintMarketingTokens({
      args: ['--strict'],
      webRoot: root,
      scanRoots: [join(root, 'components')],
      error: () => {},
    });
    expect(strict.code).toBe(1);
  });

  it('collects ts/tsx/css but skips tests', () => {
    const { root, scanRoot } = makeFixture();
    fixtureRoot = root;
    writeFileSync(join(scanRoot, 'A.ts'), 'export const a = 1;\n');
    writeFileSync(join(scanRoot, 'B.css'), '.x{}\n');
    writeFileSync(join(scanRoot, 'A.test.ts'), 'export const b = 1;\n');
    const files = collectMarketingSources(root).map(p => p.split('/').pop());
    expect(files).toContain('A.ts');
    expect(files).toContain('B.css');
    expect(files).not.toContain('A.test.ts');
  });
});
