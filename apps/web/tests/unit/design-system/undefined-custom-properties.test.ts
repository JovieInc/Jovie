import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Undefined custom-property guard.
 *
 * `var(--x)` (and Tailwind's `utility-(--x)` shorthand) silently resolves to
 * nothing when `--x` is defined nowhere. That is how `--focus-ring` shipped:
 * 17 call sites drew `ring-[rgb(var(--focus-ring))]` while the design system
 * only defined `--focus-ring-width` / `--focus-ring-offset`, so the focus
 * rings on public-profile controls and the OTP digit box had no colour.
 *
 * This guard fails when live source in apps/web or packages/ui references a
 * custom property, without a fallback, that no scanned source defines.
 * A definition is any of: a CSS / inline-style declaration (`--x: …`,
 * `'--x': …`), a Tailwind arbitrary property (`[--x:…]`), `@property --x`,
 * `style.setProperty('--x', …)`, or a next/font `variable: '--x'`.
 *
 * KNOWN_UNRESOLVED is debt that predates the guard. It may only shrink: an
 * entry that becomes defined (or unused) fails the stale-entry test, so the
 * list cannot quietly carry dead names. Never add a name to make a new
 * reference pass; define the token or use an existing one.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// tests/unit/design-system → apps/web
const WEB_ROOT = join(__dirname, '..', '..', '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');

const SCANNED_ROOTS = [
  join(WEB_ROOT, 'app'),
  join(WEB_ROOT, 'components'),
  join(WEB_ROOT, 'styles'),
  join(WEB_ROOT, 'lib'),
  join(REPO_ROOT, 'packages', 'ui'),
] as const;

const SOURCE_EXT = /\.(tsx?|jsx?|mjs|css)$/;
const NON_LIVE_FILE = /\.(test|spec|stories)\.[tj]sx?$/;
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  'tests',
  '__tests__',
]);

/** Supplied at runtime by Tailwind / Radix, never declared in our source. */
const RUNTIME_PROVIDED = /^--(tw|radix)-/;

/**
 * Pre-existing references with no static definition in scanned source.
 * Shrink-only. Some are Tailwind default-theme variables that
 * exist at runtime; the rest are real dangling references awaiting a fix.
 */
const KNOWN_UNRESOLVED: ReadonlySet<string> = new Set([
  '--accent-text',
  '--border-default',
  '--color-destructive',
  '--color-ring',
  '--font-caption',
  '--grayN',
  '--line-height-normal',
  '--line-height-tight',
  '--outcome-accent',
  '--profile-drawer-header',
  '--profile-drawer-height-max',
  '--spacing',
  '--surface-1',
  '--surface-2',
  '--text-nav',
  '--text-tertiary',
  '--w',
]);

const DEFINITION_PATTERNS = [
  /(--[a-zA-Z0-9_-]+)\s*['"`]?\]?\s*:/g,
  /\[(--[a-zA-Z0-9_-]+):/g,
  /setProperty\(\s*['"`](--[a-zA-Z0-9_-]+)/g,
  /@property\s+(--[a-zA-Z0-9_-]+)/g,
  // next/font: `variable: '--font-x'`
  /variable:\s*['"`](--[a-zA-Z0-9_-]+)/g,
] as const;

// `var(--x)` with no fallback, and Tailwind v4 `utility-(--x)` shorthand.
const USAGE_PATTERNS = [
  /var\(\s*(--[a-zA-Z0-9_-]+)\s*\)/g,
  /[a-z-]+-\((--[a-zA-Z0-9_-]+)\)/g,
] as const;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(full, out);
    } else if (SOURCE_EXT.test(entry) && !NON_LIVE_FILE.test(entry)) {
      out.push(full);
    }
  }
}

function scan(): {
  defined: Set<string>;
  used: Map<string, string[]>;
} {
  const files: string[] = [];
  for (const root of SCANNED_ROOTS) walk(root, files);

  const defined = new Set<string>();
  const used = new Map<string, string[]>();
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of DEFINITION_PATTERNS) {
      for (const match of source.matchAll(pattern)) defined.add(match[1]);
    }
    for (const pattern of USAGE_PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        const sites = used.get(match[1]) ?? [];
        const rel = relative(REPO_ROOT, file);
        if (!sites.includes(rel)) sites.push(rel);
        used.set(match[1], sites);
      }
    }
  }
  return { defined, used };
}

describe('undefined custom-property guard', () => {
  const { defined, used } = scan();
  const unresolved = [...used.keys()]
    .filter(name => !defined.has(name) && !RUNTIME_PROVIDED.test(name))
    .sort();

  it('scans a non-trivial amount of source', () => {
    expect(defined.size).toBeGreaterThan(500);
    expect(used.size).toBeGreaterThan(500);
  });

  it('references no custom property that is defined nowhere', () => {
    const offenders = unresolved
      .filter(name => !KNOWN_UNRESOLVED.has(name))
      .map(name => `${name} ← ${(used.get(name) ?? []).join(', ')}`);

    expect(
      offenders,
      'These custom properties are referenced without a fallback but defined ' +
        'nowhere, so the declaration resolves to nothing. Use an existing ' +
        'token (e.g. ring-focus / --color-focus-ring) or define the token in ' +
        'apps/web/styles/design-system.css.'
    ).toEqual([]);
  });

  it('never leaves --focus-ring dangling (use ring-focus / --color-focus-ring)', () => {
    expect(used.get('--focus-ring') ?? []).toEqual([]);
  });

  it('keeps KNOWN_UNRESOLVED shrink-only (no stale entries)', () => {
    const stale = [...KNOWN_UNRESOLVED].filter(
      name => !unresolved.includes(name)
    );
    expect(
      stale,
      'These names are now defined or unused. Remove them from KNOWN_UNRESOLVED.'
    ).toEqual([]);
  });
});
