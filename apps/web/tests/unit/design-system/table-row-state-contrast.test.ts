import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildThemeTables,
  defaultCssFiles,
  extractRules,
  resolveValue,
} from '../../../lib/a11y-gates/contrast-engine';

/**
 * Table row-state contrast (JOV-7861).
 *
 * Every UnifiedTable/AdminDataTable row paints `--color-row-hover` or
 * `--color-row-selected` behind its text. Body text in the tail of the
 * hierarchy (secondary, tertiary, quaternary) must stay at or above WCAG AA
 * 4.5:1 on those tints in both themes, including the app-shell frame's dark
 * overrides. Unlike the luminance-only contrast engine, this composites the
 * translucent dark tints in sRGB over each surface a table sits on and
 * converts chromatic oklch exactly.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..', '..');
const AA = 4.5;

type Rgba = readonly [number, number, number, number];

function srgbFromLinear(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

function linearFromSrgb(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function alphaOf(part: string | undefined): number {
  if (!part) return 1;
  const value = part.trim();
  return value.endsWith('%')
    ? Number.parseFloat(value) / 100
    : Number.parseFloat(value);
}

export function parseRgba(value: string): Rgba {
  const v = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{6})$/.exec(v);
  if (hex) {
    const n = hex[1];
    return [
      Number.parseInt(n.slice(0, 2), 16) / 255,
      Number.parseInt(n.slice(2, 4), 16) / 255,
      Number.parseInt(n.slice(4, 6), 16) / 255,
      1,
    ];
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(v);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
    return [
      Number.parseFloat(parts[0]) / 255,
      Number.parseFloat(parts[1]) / 255,
      Number.parseFloat(parts[2]) / 255,
      alphaOf(parts[3]),
    ];
  }
  const oklch = /^oklch\(([^)]+)\)$/.exec(v);
  if (oklch) {
    const [main, alphaPart] = oklch[1].split('/');
    const [lRaw, cRaw, hRaw] = main.trim().split(/\s+/);
    const l = lRaw.endsWith('%')
      ? Number.parseFloat(lRaw) / 100
      : Number.parseFloat(lRaw);
    const c = Number.parseFloat(cRaw);
    const h = (Number.parseFloat(hRaw) * Math.PI) / 180;
    const a = c * Math.cos(h);
    const b = c * Math.sin(h);
    const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const channel = (x: number) => Math.min(1, Math.max(0, srgbFromLinear(x)));
    return [
      channel(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
      channel(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
      channel(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
      alphaOf(alphaPart),
    ];
  }
  throw new Error(`Unsupported color for row-state contrast: ${value}`);
}

function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg[3];
  return [
    fg[0] * a + bg[0] * (1 - a),
    fg[1] * a + bg[1] * (1 - a),
    fg[2] * a + bg[2] * (1 - a),
    1,
  ];
}

function luminance([r, g, b]: Rgba): number {
  return (
    0.2126 * linearFromSrgb(r) +
    0.7152 * linearFromSrgb(g) +
    0.0722 * linearFromSrgb(b)
  );
}

export function ratio(fg: Rgba, bg: Rgba): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_TOKENS = [
  '--color-text-secondary-token',
  '--color-text-tertiary-token',
  '--color-text-quaternary-token',
] as const;
const TINT_TOKENS = ['--color-row-hover', '--color-row-selected'] as const;
const SURFACE_TOKENS = [
  '--app-shell-content-surface',
  '--color-bg-surface-0',
  '--color-bg-surface-1',
] as const;

type Theme = { readonly name: string; readonly table: Map<string, string> };

function themes(): Theme[] {
  const tables = buildThemeTables(
    defaultCssFiles(WEB_ROOT).map(file => readFileSync(file, 'utf8'))
  );
  // The app shell frame redefines surfaces and tints for dark app routes.
  const frame = new Map(tables.dark);
  const systemB = readFileSync(
    join(WEB_ROOT, 'styles', 'system-b-app.css'),
    'utf8'
  );
  let frameRules = 0;
  for (const rule of extractRules(systemB)) {
    const selectors = rule.selector.split(',').map(part => part.trim());
    if (
      rule.atContext === '' &&
      selectors.includes('[data-app-shell-frame="true"].dark')
    ) {
      frameRules += 1;
      for (const [name, value] of rule.declarations) frame.set(name, value);
    }
  }
  if (frameRules === 0) {
    throw new Error(
      'App shell dark frame tokens not found in system-b-app.css'
    );
  }
  return [
    { name: 'light', table: tables.light },
    { name: 'dark', table: tables.dark },
    { name: 'dark app frame', table: frame },
  ];
}

function color(token: string, table: Map<string, string>): Rgba {
  const value = resolveValue(`var(${token})`, table);
  if (!value) throw new Error(`Unresolved token ${token}`);
  return parseRgba(value);
}

describe('table row-state contrast (JOV-7861)', () => {
  it('parses the color forms the row tokens use', () => {
    expect(parseRgba('#ffffff')).toEqual([1, 1, 1, 1]);
    expect(parseRgba('rgba(255, 255, 255, 0.5)')[3]).toBe(0.5);
    const grey = parseRgba('oklch(62.8% 0 0)');
    expect(grey[0]).toBeCloseTo(grey[1], 5);
    expect(ratio(parseRgba('#000000'), parseRgba('#ffffff'))).toBeCloseTo(
      21,
      5
    );
  });

  it('flags the pre-fix light quaternary on the selected tint', () => {
    // The value JOV-7861 reported; keeps this test able to see a regression.
    const selected = parseRgba('oklch(94.8% 0.006 282)');
    expect(ratio(parseRgba('#6a7078'), selected)).toBeLessThan(AA);
  });

  for (const theme of themes()) {
    it(`keeps tail text at AA on hover and selected rows (${theme.name})`, () => {
      const failures: string[] = [];
      for (const surface of SURFACE_TOKENS) {
        const base = color(surface, theme.table);
        for (const tint of TINT_TOKENS) {
          const row = over(color(tint, theme.table), base);
          for (const text of TEXT_TOKENS) {
            const value = ratio(color(text, theme.table), row);
            if (value < AA) {
              failures.push(
                `${text} on ${tint} over ${surface}: ${value.toFixed(2)}:1`
              );
            }
          }
        }
      }
      expect(failures).toEqual([]);
    });
  }
});
