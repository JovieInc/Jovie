/**
 * Computed-contrast engine (JOV #12012).
 *
 * Parses the design-token CSS into per-theme (light/dark) variable tables,
 * resolves `var()` chains, converts hex / rgb[a] / lch / oklch values to
 * relative luminance, and computes real WCAG 2.1 contrast ratios for
 * declared token pairs.
 *
 * Consumed by:
 *   - scripts/lint-contrast-computed.ts (CLI, chained into lint:contrast-ratchet)
 *   - tests/unit/design-system/computed-contrast.test.ts (Unit Tests merge gate)
 *   - tests/unit/design-system/reduced-motion-tokens.test.ts (CSS rule parser)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── Types ───────────────────────────────────────────────────────────────────

export interface CssRule {
  readonly selector: string;
  /** Enclosing at-rule prelude chain (e.g. media queries), '' at top level. */
  readonly atContext: string;
  readonly declarations: Map<string, string>;
}

export interface ThemeTables {
  readonly light: Map<string, string>;
  readonly dark: Map<string, string>;
  readonly [theme: string]: Map<string, string>;
}

export interface ContrastPair {
  readonly name: string;
  readonly fg: string;
  readonly bg: string;
  readonly minRatio: number;
  readonly themes?: readonly string[];
  /** Opaque surface below a translucent background tint. */
  readonly underlay?: string;
}

export interface PairCheckResult {
  readonly status: 'pass' | 'fail' | 'unresolvable';
  readonly ratio?: number;
  readonly detail?: string;
}

export interface PairResultRecord extends ContrastPair, PairCheckResult {
  readonly theme: string;
}

export interface ContrastRunResult {
  readonly failures: PairResultRecord[];
  readonly warnings: PairResultRecord[];
  readonly passes: PairResultRecord[];
}

interface ParsedColor {
  readonly rgb: readonly [number, number, number];
  readonly luminance: number;
  readonly alpha: number;
}

// ── CSS parsing ─────────────────────────────────────────────────────────────

export function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Walk a stylesheet and return flat rule records with their custom-property
 * declarations. Handles nested at-rules; ignores non-custom-property decls.
 */
export function extractRules(css: string): CssRule[] {
  const src = stripCssComments(css);
  const rules: CssRule[] = [];
  const stack: { prelude: string; isAt: boolean }[] = [];
  let buf = '';

  const flushDeclarations = (selector: string, atContext: string): void => {
    const declarations = new Map<string, string>();
    for (const decl of buf.split(';')) {
      const idx = decl.indexOf(':');
      if (idx === -1) continue;
      const name = decl.slice(0, idx).trim();
      const value = decl.slice(idx + 1).trim();
      if (name.startsWith('--') && value) declarations.set(name, value);
    }
    if (declarations.size > 0) {
      rules.push({ selector, atContext, declarations });
    }
    buf = '';
  };

  for (const ch of src) {
    if (ch === '{') {
      // Statements before the selector (e.g. `@import "…";`) end in `;` —
      // only the text after the last `;` is this block's prelude.
      const prelude = buf.slice(buf.lastIndexOf(';') + 1).trim();
      buf = '';
      stack.push({ prelude, isAt: prelude.startsWith('@') });
    } else if (ch === '}') {
      const top = stack.at(-1);
      if (top && !top.isAt) {
        const atContext = stack
          .slice(0, -1)
          .filter(s => s.isAt)
          .map(s => s.prelude)
          .join(' && ');
        flushDeclarations(top.prelude, atContext);
      } else {
        buf = '';
      }
      stack.pop();
    } else {
      buf += ch;
    }
  }
  return rules;
}

const REDUCED_MOTION = /prefers-reduced-motion/;

function selectorMatchesLight(selector: string): boolean {
  // Any comma-part that is exactly `:root` (not dark/high-contrast/alt-theme).
  return selector.split(',').some(part => part.trim() === ':root');
}

function selectorMatchesDark(selector: string): boolean {
  return selector.split(',').some(part => part.trim() === ':root.dark');
}

/**
 * Build light/dark variable tables from CSS file contents. Dark inherits
 * light values and overrides with `:root.dark` declarations, mirroring the
 * runtime cascade.
 */
export function buildThemeTables(cssContents: readonly string[]): ThemeTables {
  const light = new Map<string, string>();
  const darkOverrides = new Map<string, string>();

  for (const css of cssContents) {
    for (const rule of extractRules(css)) {
      if (rule.atContext !== '' || REDUCED_MOTION.test(rule.atContext)) {
        continue;
      }
      if (selectorMatchesLight(rule.selector)) {
        for (const [k, v] of rule.declarations) light.set(k, v);
      } else if (selectorMatchesDark(rule.selector)) {
        for (const [k, v] of rule.declarations) darkOverrides.set(k, v);
      }
    }
  }

  const dark = new Map(light);
  for (const [k, v] of darkOverrides) dark.set(k, v);
  return { light, dark };
}

// ── var() resolution ────────────────────────────────────────────────────────

const VAR_RE = /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/;

/**
 * Resolve a CSS value against a variable table, following var() chains
 * (including fallbacks). Returns null on a missing variable or cycle.
 */
export function resolveValue(
  value: string,
  table: Map<string, string>,
  seen: Set<string> = new Set()
): string | null {
  let out = value.trim();
  let guard = 0;
  while (out.includes('var(')) {
    if (guard > 50) return null;
    guard += 1;
    const m = VAR_RE.exec(out);
    if (!m) return null;
    const [full, name, fallback] = m;
    const stored = table.get(name);
    let replacement: string;
    if (stored !== undefined && !seen.has(name)) {
      seen.add(name);
      replacement = stored;
    } else if (fallback !== undefined) {
      replacement = fallback;
    } else {
      return null;
    }
    out = out.replace(full, replacement).trim();
  }
  return out;
}

// ── Color parsing → relative luminance ──────────────────────────────────────

function srgbChannelToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminanceFromRgb(r: number, g: number, b: number): number {
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

function srgbFromLinear(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

function color(r: number, g: number, b: number, alpha = 1): ParsedColor | null {
  if (![r, g, b, alpha].every(Number.isFinite)) return null;
  const rgb = [r, g, b].map(c => Math.min(1, Math.max(0, c))) as [
    number,
    number,
    number,
  ];
  return {
    rgb,
    alpha: Math.min(1, Math.max(0, alpha)),
    luminance: luminanceFromRgb(...rgb),
  };
}

function parseAlphaComponent(s: string): number {
  const t = s.trim();
  const n = Number.parseFloat(t);
  if (Number.isNaN(n)) return Number.NaN;
  return t.endsWith('%') ? n / 100 : n;
}

/**
 * Parse a resolved CSS color into luminance + alpha, or null when the format
 * cannot be statically evaluated (color-mix, gradients).
 */
export function parseColor(value: string): ParsedColor | null {
  const v = value.trim().toLowerCase();

  if (v === 'white') return color(1, 1, 1);
  if (v === 'black') return color(0, 0, 0);
  if (v === 'transparent') return color(0, 0, 0, 0);

  // #rgb / #rgba / #rrggbb / #rrggbbaa
  const hex = /^#([0-9a-f]{3,8})$/.exec(v);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) {
      h = [...h].map(c => c + c).join('');
    }
    if (h.length !== 6 && h.length !== 8) return null;
    const r = Number.parseInt(h.slice(0, 2), 16) / 255;
    const g = Number.parseInt(h.slice(2, 4), 16) / 255;
    const b = Number.parseInt(h.slice(4, 6), 16) / 255;
    const alpha = h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1;
    return color(r, g, b, alpha);
  }

  // rgb()/rgba() — comma or space syntax, optional % units
  const rgb = /^rgba?\(([^)]+)\)$/.exec(v);
  if (rgb) {
    const parts = rgb[1]
      .replaceAll('/', ' ')
      .split(/[\s,]+/)
      .filter(Boolean);
    if (parts.length < 3) return null;
    const chan = (p: string): number =>
      p.endsWith('%') ? Number.parseFloat(p) / 100 : Number.parseFloat(p) / 255;
    const r = chan(parts[0]);
    const g = chan(parts[1]);
    const b = chan(parts[2]);
    let alpha = 1;
    if (parts[3] !== undefined) {
      alpha = parts[3].endsWith('%')
        ? Number.parseFloat(parts[3]) / 100
        : Number.parseFloat(parts[3]);
    }
    if ([r, g, b, alpha].some(Number.isNaN)) return null;
    return color(r, g, b, alpha);
  }

  const polar = /^(oklch|lch)\(([^)]+)\)$/.exec(v);
  if (polar) {
    const [main, alphaPart] = polar[2].split('/');
    const parts = main.trim().split(/\s+/);
    if (parts.length !== 3) return null;
    let l = Number.parseFloat(parts[0]);
    const c = Number.parseFloat(parts[1]);
    const h = (Number.parseFloat(parts[2]) * Math.PI) / 180;
    const a = c * Math.cos(h);
    const b = c * Math.sin(h);
    const alpha = alphaPart ? parseAlphaComponent(alphaPart) : 1;
    if (polar[1] === 'oklch') {
      if (parts[0].endsWith('%')) l /= 100;
      const ll = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
      const mm = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
      const ss = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
      return color(
        srgbFromLinear(
          4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss
        ),
        srgbFromLinear(
          -1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss
        ),
        srgbFromLinear(
          -0.0041960863 * ll - 0.7034186147 * mm + 1.707614701 * ss
        ),
        alpha
      );
    }
    // CSS LCH uses Lab D50. Adapt XYZ D50 to D65 before converting to sRGB.
    const f = (x: number) =>
      x > 6 / 29 ? x ** 3 : 3 * (6 / 29) ** 2 * (x - 4 / 29);
    const fy = (l + 16) / 116;
    const x = 0.96422 * f(fy + a / 500);
    const y = f(fy);
    const z = 0.82521 * f(fy - b / 200);
    const xd = 0.9555766 * x - 0.0230393 * y + 0.0631636 * z;
    const yd = -0.0282895 * x + 1.0099416 * y + 0.0210077 * z;
    const zd = 0.0122982 * x - 0.020483 * y + 1.3299098 * z;
    return color(
      srgbFromLinear(3.2404542 * xd - 1.5371385 * yd - 0.4985314 * zd),
      srgbFromLinear(-0.969266 * xd + 1.8760108 * yd + 0.041556 * zd),
      srgbFromLinear(0.0556434 * xd - 0.2040259 * yd + 1.0572252 * zd),
      alpha
    );
  }

  return null; // color-mix(), gradients, unknown keywords, etc.
}

// ── WCAG contrast ───────────────────────────────────────────────────────────

export function contrastRatio(lumA: number, lumB: number): number {
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Composite in encoded sRGB, then compute luminance (JOV-7861). */
export function compositeColor(fg: ParsedColor, bg: ParsedColor): ParsedColor {
  const rgb = fg.rgb.map(
    (c, i) => c * fg.alpha + bg.rgb[i] * (1 - fg.alpha)
  ) as [number, number, number];
  return { rgb, alpha: 1, luminance: luminanceFromRgb(...rgb) };
}

/** Check one pair against a theme variable table. */
export function checkPair(
  pair: ContrastPair,
  table: Map<string, string>
): PairCheckResult {
  const fgRaw = table.get(pair.fg);
  const bgRaw = table.get(pair.bg);
  if (fgRaw === undefined || bgRaw === undefined) {
    return {
      status: 'unresolvable',
      detail: `missing token ${fgRaw === undefined ? pair.fg : pair.bg}`,
    };
  }

  const fgResolved = resolveValue(fgRaw, table);
  const bgResolved = resolveValue(bgRaw, table);
  if (fgResolved === null || bgResolved === null) {
    return { status: 'unresolvable', detail: 'unresolvable var() chain' };
  }

  const fgColor = parseColor(fgResolved);
  let bgColor = parseColor(bgResolved);
  if (fgColor === null || bgColor === null) {
    return {
      status: 'unresolvable',
      detail: `unparseable color (fg: ${fgResolved} | bg: ${bgResolved})`,
    };
  }
  if (bgColor.alpha < 1) {
    const underlayRaw = pair.underlay ? table.get(pair.underlay) : undefined;
    const underlayValue = underlayRaw ? resolveValue(underlayRaw, table) : null;
    const underlay = underlayValue ? parseColor(underlayValue) : null;
    if (!underlay || underlay.alpha < 1) {
      return {
        status: 'unresolvable',
        detail: 'translucent background needs an opaque underlay',
      };
    }
    bgColor = compositeColor(bgColor, underlay);
  }

  const fgLum = compositeColor(fgColor, bgColor).luminance;
  const ratio = contrastRatio(fgLum, bgColor.luminance);
  return {
    status: ratio >= pair.minRatio ? 'pass' : 'fail',
    ratio,
  };
}

/** Run every configured pair against both theme tables. */
export function runContrastChecks(
  pairs: readonly ContrastPair[],
  tables: ThemeTables
): ContrastRunResult {
  const failures: PairResultRecord[] = [];
  const warnings: PairResultRecord[] = [];
  const passes: PairResultRecord[] = [];
  for (const pair of pairs) {
    const themes = pair.themes ?? Object.keys(tables);
    for (const theme of themes) {
      const table = tables[theme];
      if (!table) throw new Error(`Missing contrast theme: ${theme}`);
      const result = checkPair(pair, table);
      const record: PairResultRecord = { ...pair, theme, ...result };
      if (result.status === 'fail') failures.push(record);
      else if (result.status === 'unresolvable') warnings.push(record);
      else passes.push(record);
    }
  }
  return { failures, warnings, passes };
}

// ── Default loaders ─────────────────────────────────────────────────────────

export function defaultCssFiles(webRoot: string): string[] {
  return [
    join(webRoot, 'styles', 'design-system.css'),
    join(webRoot, 'styles', 'linear-tokens.css'),
  ];
}

export function loadThemeTablesFromFiles(
  files: readonly string[]
): ThemeTables {
  return buildThemeTables(files.map(f => readFileSync(f, 'utf8')));
}

export function loadPairsConfig(configPath: string): ContrastPair[] {
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
    pairs: ContrastPair[];
  };
  return config.pairs;
}
