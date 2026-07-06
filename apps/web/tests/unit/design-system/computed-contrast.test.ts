import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildThemeTables,
  checkPair,
  contrastRatio,
  defaultCssFiles,
  loadPairsConfig,
  loadThemeTablesFromFiles,
  parseColor,
  resolveValue,
  runContrastChecks,
} from '../../../lib/a11y-gates/contrast-engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..', '..');
const loadDefaultTables = () =>
  loadThemeTablesFromFiles(defaultCssFiles(WEB_ROOT));
const loadDefaultPairs = () =>
  loadPairsConfig(join(WEB_ROOT, 'contrast-pairs.config.json'));

/**
 * Computed-contrast gate (JOV #12012).
 *
 * Unlike the regex contrast-ratchet (a raw-color class counter), this gate
 * resolves real token pairs from styles/design-system.css +
 * styles/linear-tokens.css and computes actual WCAG 2.1 contrast ratios.
 * A token pair dropping below AA fails this test — and this test runs in
 * the Unit Tests merge gate, so the failure blocks CI.
 *
 * The pair manifest lives in contrast-pairs.config.json.
 * CLI equivalent: `pnpm --filter web run lint:contrast-computed`.
 */

describe('computed contrast gate — WCAG AA on design tokens', () => {
  it('every declared token pair meets its WCAG AA threshold in light and dark themes', () => {
    const tables = loadDefaultTables();
    const pairs = loadDefaultPairs();
    const { failures, warnings } = runContrastChecks(pairs, tables);

    const failureReport = failures
      .map(
        f =>
          `${f.name} [${f.theme}]: ${f.ratio?.toFixed(2)}:1 < ${f.minRatio}:1 (${f.fg} on ${f.bg})`
      )
      .join('\n');
    expect(
      failures,
      `Token pairs below WCAG AA:\n${failureReport}`
    ).toHaveLength(0);

    // Every declared pair must stay statically resolvable — if a token is
    // refactored to color-mix()/etc., re-point the pair or move the check
    // to the rendered-story axe gate rather than silently losing coverage.
    const warningReport = warnings
      .map(w => `${w.name} [${w.theme}]: ${w.detail}`)
      .join('\n');
    expect(
      warnings,
      `Unresolvable contrast pairs (coverage lost):\n${warningReport}`
    ).toHaveLength(0);
  });

  it('checks a meaningful number of pair-theme combinations', () => {
    const tables = loadDefaultTables();
    const pairs = loadDefaultPairs();
    const { passes } = runContrastChecks(pairs, tables);
    expect(passes.length).toBeGreaterThanOrEqual(20);
  });
});

describe('computed contrast checker — red→green proof on fixtures', () => {
  const FIXTURE_CSS = `
    :root {
      --fg-bad: #888888;
      --fg-good: #111111;
      --bg: #999999;
      --alias: var(--fg-good);
      --lch-dark: lch(9.894% 0 282);
      --oklch-light: oklch(97% 0 0);
      --translucent: rgba(0, 0, 0, 0.9);
      --unresolvable: color-mix(in srgb, #fff 50%, #000);
    }
    :root.dark {
      --bg: #06070a;
      --fg-bad: #333344;
    }
  `;
  const tables = buildThemeTables([FIXTURE_CSS]);

  it('RED: a pair below AA fails', () => {
    const result = checkPair(
      { name: 'bad', fg: '--fg-bad', bg: '--bg', minRatio: 4.5 },
      tables.light
    );
    expect(result.status).toBe('fail');
    expect(result.ratio ?? 99).toBeLessThan(4.5);
  });

  it('GREEN: fixing the foreground token makes the same pair pass', () => {
    const result = checkPair(
      { name: 'good', fg: '--fg-good', bg: '--bg', minRatio: 4.5 },
      tables.light
    );
    expect(result.status).toBe('pass');
    expect(result.ratio ?? 0).toBeGreaterThanOrEqual(4.5);
  });

  it('dark theme overrides are applied (same pair, different verdicts per theme)', () => {
    const light = checkPair(
      { name: 'x', fg: '--fg-bad', bg: '--bg', minRatio: 4.5 },
      tables.light
    );
    const dark = checkPair(
      { name: 'x', fg: '--fg-bad', bg: '--bg', minRatio: 4.5 },
      tables.dark
    );
    expect(light.status).toBe('fail'); // #888 on #999
    expect(dark.status).toBe('fail'); // #334 on #06070a — still fails
    expect(dark.ratio).not.toBe(light.ratio);
  });

  it('resolves var() alias chains', () => {
    const result = checkPair(
      { name: 'alias', fg: '--alias', bg: '--bg', minRatio: 4.5 },
      tables.light
    );
    expect(result.status).toBe('pass');
  });

  it('parses lch() and oklch() token formats', () => {
    const lch = checkPair(
      { name: 'lch', fg: '--lch-dark', bg: '--oklch-light', minRatio: 4.5 },
      tables.light
    );
    expect(lch.status).toBe('pass');
    expect(lch.ratio ?? 0).toBeGreaterThan(10);
  });

  it('composites translucent foregrounds over the background', () => {
    const result = checkPair(
      {
        name: 'alpha',
        fg: '--translucent',
        bg: '--oklch-light',
        minRatio: 4.5,
      },
      tables.light
    );
    expect(result.status).toBe('pass');
  });

  it('reports color-mix() pairs as unresolvable instead of guessing', () => {
    const result = checkPair(
      { name: 'mix', fg: '--unresolvable', bg: '--bg', minRatio: 4.5 },
      tables.light
    );
    expect(result.status).toBe('unresolvable');
  });
});

describe('computed contrast primitives', () => {
  it('contrastRatio matches known WCAG values', () => {
    expect(contrastRatio(1, 0)).toBeCloseTo(21, 5); // white on black
    expect(contrastRatio(0.5, 0.5)).toBeCloseTo(1, 5);
  });

  it('parseColor handles hex shorthand and alpha hex', () => {
    expect(parseColor('#fff')?.luminance).toBeCloseTo(1, 5);
    expect(parseColor('#00000080')?.alpha).toBeCloseTo(0.5, 1);
  });

  it('resolveValue supports fallbacks and rejects cycles', () => {
    const table = new Map<string, string>([
      ['--a', 'var(--b)'],
      ['--b', 'var(--a)'],
    ]);
    expect(resolveValue('var(--missing, #123456)', table)).toBe('#123456');
    expect(resolveValue('var(--a)', table)).toBeNull();
  });
});
