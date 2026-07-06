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
}

export interface ContrastPair {
  readonly name: string;
  readonly fg: string;
  readonly bg: string;
  readonly minRatio: number;
  readonly themes?: readonly ('light' | 'dark')[];
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
      const top = stack[stack.length - 1];
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
    const m = out.match(VAR_RE);
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

/** CIELAB L* → relative luminance Y (Y depends only on L* in Lab/LCH). */
function luminanceFromLabLightness(lStar: number): number {
  const fy = (lStar + 16) / 116;
  const d = 6 / 29;
  return fy > d ? fy ** 3 : 3 * d * d * (fy - 4 / 29);
}

function parseAlphaComponent(s: string): number {
  const t = s.trim();
  const n = Number.parseFloat(t);
  if (Number.isNaN(n)) return 1;
  return t.endsWith('%') ? n / 100 : n;
}

/**
 * Parse a resolved CSS color into luminance + alpha, or null when the format
 * cannot be statically evaluated (color-mix, gradients, chromatic oklch).
 */
export function parseColor(value: string): ParsedColor | null {
  const v = value.trim().toLowerCase();

  if (v === 'white') return { luminance: 1, alpha: 1 };
  if (v === 'black') return { luminance: 0, alpha: 1 };
  if (v === 'transparent') return { luminance: 0, alpha: 0 };

  // #rgb / #rgba / #rrggbb / #rrggbbaa
  const hex = v.match(/^#([0-9a-f]{3,8})$/);
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
    return { luminance: luminanceFromRgb(r, g, b), alpha };
  }

  // rgb()/rgba() — comma or space syntax, optional % units
  const rgb = v.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const parts = rgb[1]
      .replace(/\//g, ' ')
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
    return { luminance: luminanceFromRgb(r, g, b), alpha };
  }

  // lch(L% C H [/ alpha]) — Y depends only on L*
  const lch = v.match(/^lch\(([^)]+)\)$/);
  if (lch) {
    const [main, alphaPart] = lch[1].split('/');
    const parts = main.trim().split(/\s+/);
    const lStar = Number.parseFloat(parts[0]);
    if (Number.isNaN(lStar)) return null;
    const alpha = alphaPart ? parseAlphaComponent(alphaPart) : 1;
    return { luminance: luminanceFromLabLightness(lStar), alpha };
  }

  // oklch(L C H [/ alpha]) — exact only for (near-)achromatic colors,
  // where Oklab lightness relates to Y as Y ≈ L^3.
  const oklch = v.match(/^oklch\(([^)]+)\)$/);
  if (oklch) {
    const [main, alphaPart] = oklch[1].split('/');
    const parts = main.trim().split(/\s+/);
    let l = Number.parseFloat(parts[0]);
    if (Number.isNaN(l)) return null;
    if (parts[0].includes('%')) l /= 100;
    const chroma = Number.parseFloat(parts[1] ?? '0') || 0;
    if (chroma > 0.04) return null; // chromatic — not statically evaluable
    const alpha = alphaPart ? parseAlphaComponent(alphaPart) : 1;
    return { luminance: l ** 3, alpha };
  }

  return null; // color-mix(), gradients, unknown keywords, etc.
}

// ── WCAG contrast ───────────────────────────────────────────────────────────

export function contrastRatio(lumA: number, lumB: number): number {
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Composite a translucent foreground luminance over an opaque background. */
function compositeLuminance(fg: ParsedColor, bg: ParsedColor): number {
  if (fg.alpha >= 1) return fg.luminance;
  return fg.luminance * fg.alpha + bg.luminance * (1 - fg.alpha);
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
  const bgColor = parseColor(bgResolved);
  if (fgColor === null || bgColor === null) {
    return {
      status: 'unresolvable',
      detail: `unparseable color (fg: ${fgResolved} | bg: ${bgResolved})`,
    };
  }
  if (bgColor.alpha < 1) {
    return { status: 'unresolvable', detail: 'translucent background' };
  }

  const fgLum = compositeLuminance(fgColor, bgColor);
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
    const themes = pair.themes ?? (['light', 'dark'] as const);
    for (const theme of themes) {
      const table = theme === 'light' ? tables.light : tables.dark;
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
