import { describe, expect, it } from 'vitest';
import {
  buildThemeTables,
  checkPair,
  extractRules,
  parseColor,
} from './contrast-engine';

describe('extractRules', () => {
  it('reads the innermost rule when an at-rule wraps it', () => {
    const rules = extractRules(
      '@media (min-width: 1px) { .btn { --color: red; } }'
    );

    expect(rules).toHaveLength(1);
    expect(rules[0]?.selector).toBe('.btn');
    expect(rules[0]?.declarations.get('--color')).toBe('red');
    expect(rules[0]?.atContext).toContain('@media');
  });
});

describe('sRGB contrast compositing', () => {
  const tables = buildThemeTables([
    `
    :root {
      --fg: #ffffff;
      --bg: rgba(255, 255, 255, 0.5);
      --base: #000000;
      --chroma: oklch(94.8% 0.006 282);
      --muted: #6a7078;
    }
  `,
  ]);
  it('composites a background tint in sRGB before computing luminance', () => {
    const pair = {
      name: 'tint',
      fg: '--fg',
      bg: '--bg',
      underlay: '--base',
      minRatio: 4.5,
    };
    expect(checkPair(pair, tables.light).ratio).toBeCloseTo(3.97665, 4);
    expect(checkPair(pair, tables.light).status).toBe('fail');
    expect(checkPair({ ...pair, minRatio: 3 }, tables.light).status).toBe(
      'pass'
    );
    expect(
      checkPair({ ...pair, underlay: undefined }, tables.light).status
    ).toBe('unresolvable');
    expect(checkPair({ ...pair, underlay: '--bg' }, tables.light).status).toBe(
      'unresolvable'
    );
  });
  it('composites translucent text in sRGB, rather than blending luminance', () => {
    const result = checkPair(
      { name: 'fg', fg: '--bg', bg: '--base', minRatio: 4.5 },
      tables.light
    );
    expect(result.ratio).toBeCloseTo(5.28082, 4);
  });
  it('resolves a rebound foreground without renaming the pair', () => {
    const result = checkPair(
      {
        name: 'paper',
        fg: '--muted',
        fgSource: '--fg',
        bg: '--base',
        minRatio: 4.5,
      },
      tables.light
    );
    expect(result.status).toBe('pass');
    expect(result.ratio).toBeCloseTo(21, 4);
    expect(
      checkPair(
        {
          name: 'missing',
          fg: '--muted',
          fgSource: '--missing',
          bg: '--base',
          minRatio: 4.5,
        },
        tables.light
      ).status
    ).toBe('unresolvable');
  });
  it('detects the chromatic row tint regression from JOV-7861', () => {
    const result = checkPair(
      { name: 'row', fg: '--muted', bg: '--chroma', minRatio: 4.5 },
      tables.light
    );
    expect(result.status).toBe('fail');
    expect(result.ratio).toBeCloseTo(4.290295, 5);
  });
  it('converts chromatic OKLCH to sRGB and rejects malformed colors', () => {
    const red = parseColor('oklch(0.62795536 0.25768331 29.233885)');
    expect(red?.rgb[0]).toBeCloseTo(1, 4);
    expect(red?.rgb[1]).toBeCloseTo(0, 4);
    expect(red?.luminance).toBeCloseTo(0.2126, 4);
    expect(parseColor('oklch(nope 0 0)')).toBeNull();
    expect(parseColor('oklch(0.5)')).toBeNull();
    expect(parseColor('rgba(0, 0, 0, nope)')).toBeNull();
    expect(parseColor('lch(50 0 0 / nope)')).toBeNull();
  });
});
