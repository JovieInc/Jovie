import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildThemeTables,
  checkPair,
  extractRules,
  parseColor,
  resolveValue,
  runContrastChecks,
} from './contrast-engine';
import {
  contrastRegressions,
  failureBaseline,
  generateTokenPairs,
  loadContrastGate,
  loadGateTables,
} from './contrast-matrix';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = (extra = '') =>
  buildThemeTables([
    `
  :root {
    --color-bg-base: #fff;
    --color-text-primary-token: #000;
    --color-bg-hover: rgba(0,0,0,0.04);
    ${extra}
  }
  :root.dark {
    --color-bg-base: #000;
    --color-text-primary-token: #fff;
    --color-bg-hover: rgba(255,255,255,0.04);
  }
`,
  ]);
const run = (extra = '') => {
  const tables = fixture(extra);
  return runContrastChecks(generateTokenPairs(tables), tables);
};

describe('generated contrast coverage', () => {
  it('automatically measures new text tokens and new state families in both themes', () => {
    expect(run().failures).toHaveLength(0);
    for (const extra of [
      '--color-text-new-token: #777;',
      '--color-bg-new-selected: #777;',
      '--color-surface-new-hover: #777;',
      '--color-row-new-hover: #777;',
      '--color-interactive-new-active: #777;',
      '--color-cell-new-hover: #777;',
      '--color-button-new-hover: #777;',
    ]) {
      const result = run(extra);
      expect(result.warnings).toEqual([]);
      expect(result.failures.length, extra).toBeGreaterThan(0);
      expect(contrastRegressions(result, {}), extra).not.toEqual([]);
      for (const theme of ['light', 'dark']) {
        expect(
          [...result.passes, ...result.failures].some(
            p => p.theme === theme && [p.fg, p.bg].some(t => t.includes('new-'))
          )
        ).toBe(true);
      }
    }
  });
  it('checks status text at AA and UI at 3:1 on neutral surfaces and their tint', () => {
    const tables = fixture(
      '--color-warning: #888; --color-warning-subtle: #fff; --color-warning-foreground: #000;'
    );
    const pairs = generateTokenPairs(tables);
    for (const bg of [
      '--color-bg-base',
      '--color-bg-hover',
      '--color-warning-subtle',
    ]) {
      expect(
        pairs
          .filter(
            p =>
              p.fg === '--color-warning' &&
              p.bg === bg &&
              p.themes?.includes('light')
          )
          .map(p => p.minRatio)
      ).toEqual([4.5, 3]);
    }
    expect(
      pairs.some(
        p =>
          p.fg === '--color-text-primary-token' &&
          p.bg === '--color-warning-subtle'
      )
    ).toBe(true);
    const result = runContrastChecks(pairs, tables);
    expect(
      result.failures.some(
        p =>
          p.fg === '--color-warning' &&
          p.minRatio === 4.5 &&
          p.theme === 'light'
      )
    ).toBe(true);
    expect(
      result.passes.some(
        p =>
          p.fg === '--color-warning' && p.minRatio === 3 && p.theme === 'light'
      )
    ).toBe(true);
    expect(
      pairs.some(
        p =>
          p.fg === '--color-warning-foreground' &&
          p.bg === '--color-warning' &&
          p.minRatio === 4.5
      )
    ).toBe(true);
  });
  it('fails closed when new tokens cannot be resolved', () => {
    for (const extra of [
      '--color-text-new-token: var(--missing);',
      '--color-bg-new-hover: color-mix(in srgb, #fff, #000);',
    ]) {
      expect(contrastRegressions(run(extra), {})).not.toEqual([]);
      expect(run(extra).warnings.length).toBeGreaterThan(0);
    }
    expect(() =>
      generateTokenPairs(fixture('--color-btn-new-fg: #fff;'))
    ).toThrow('Uncovered contrast token');
    expect(() =>
      generateTokenPairs(
        buildThemeTables([':root { --color-bg-base: transparent; }'])
      )
    ).toThrow('No opaque surfaces');
  });
  it('measures quaternary, button hover, tooltip and shell override states from source', async () => {
    const gate = await loadContrastGate(webRoot);
    expect(gate.errors).toEqual([]);
    const all = [...gate.passes, ...gate.failures];
    for (const theme of ['light', 'dark', 'dark app frame', 'dark marketing']) {
      for (const bg of [
        '--color-bg-hover',
        '--color-bg-active',
        '--color-surface-hover',
        '--color-surface-active',
        '--color-interactive-hover',
        '--color-cell-hover',
        '--color-row-selected',
      ]) {
        expect(
          all.some(
            p =>
              p.theme === theme &&
              p.bg === bg &&
              p.fg === '--color-text-quaternary-token'
          )
        ).toBe(true);
      }
      expect(
        all.some(
          p =>
            p.theme === theme &&
            p.bg === '--color-btn-primary-hover' &&
            p.fg === '--color-btn-primary-fg'
        )
      ).toBe(true);
      expect(
        all.some(
          p =>
            p.theme === theme &&
            p.bg === '--color-bg-tooltip' &&
            p.fg === '--color-text-tooltip'
        )
      ).toBe(true);
    }
  });
});

describe('light paper tertiary', () => {
  it('keeps the dark muted gray and measures the light token on paper', async () => {
    const tables = await loadGateTables(webRoot);
    for (const theme of ['dark', 'dark app frame', 'dark marketing']) {
      const table = tables[theme];
      if (!table) throw new Error(`missing ${theme}`);
      expect(
        resolveValue(table.get('--noir-ion-text-muted') ?? '', table)
      ).toBe('#9da2ac');
      expect(
        resolveValue(table.get('--color-text-tertiary-token') ?? '', table)
      ).toBe('#9da2ac');
      expect(
        resolveValue(table.get('--linear-text-tertiary') ?? '', table)
      ).toBe('#9da2ac');
      expect(
        resolveValue(table.get('--color-text-tertiary-on-light') ?? '', table)
      ).toBe('#626872');
    }

    const light = tables.light;
    const secondary = parseColor(
      resolveValue(light.get('--color-text-secondary-token') ?? '', light) ?? ''
    );
    const tertiary = parseColor(
      resolveValue(light.get('--color-text-tertiary-on-light') ?? '', light) ??
        ''
    );
    expect(secondary).not.toBeNull();
    expect(tertiary).not.toBeNull();
    if (!secondary || !tertiary) return;
    expect(tertiary.luminance).toBeGreaterThan(secondary.luminance);

    const pairs = generateTokenPairs(tables);
    const paper = pairs.find(
      pair =>
        pair.fg === '--color-text-tertiary-token' &&
        pair.bg === '--color-bg-paper' &&
        pair.themes?.includes('dark') &&
        pair.underlay === undefined
    );
    expect(paper?.fgSource).toBe('--color-text-tertiary-on-light');
    const onPaper = checkPair(paper!, tables.dark);
    expect(onPaper.status).toBe('pass');
    expect(onPaper.ratio).toBeGreaterThanOrEqual(4.5);

    const canvas = pairs.find(
      pair =>
        pair.fg === '--color-text-tertiary-token' &&
        pair.bg === '--color-bg-base' &&
        pair.themes?.includes('dark') &&
        pair.underlay === undefined
    );
    expect(canvas?.fgSource).toBeUndefined();

    const css = await readFile(
      join(webRoot, 'styles/design-system.css'),
      'utf8'
    );
    const paperRule = extractRules(css).find(
      rule => rule.selector === '.bg-paper'
    );
    expect(paperRule?.declarations.get('--color-text-tertiary-token')).toBe(
      'var(--color-text-tertiary-on-light)'
    );
  });
});

describe('shrink-only computed contrast baseline', () => {
  const bad = () => run('--color-text-new-token: #777;');
  it('accepts existing debt, blocks lower contrast, more failures and new debt', () => {
    const result = bad();
    const baseline = failureBaseline(result);
    expect(contrastRegressions(result, baseline)).toEqual([]);
    expect(contrastRegressions(result, {})).not.toEqual([]);
    const lower = {
      ...result,
      failures: result.failures.map(p => ({ ...p, ratio: 1 })),
    };
    expect(contrastRegressions(lower, baseline)).not.toEqual([]);
    expect(
      contrastRegressions(
        { ...result, failures: [...result.failures, ...result.failures] },
        baseline
      )
    ).not.toEqual([]);
    const fixed = run();
    expect(contrastRegressions(fixed, baseline)).toEqual([]);
    expect(failureBaseline(fixed)).toEqual({});
  });
});
