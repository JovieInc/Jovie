import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Undefined Tailwind color utility guard.
 *
 * Tailwind v4 only emits a color utility (`bg-x`, `text-x`, `border-x`, ...)
 * when the theme defines `--color-x`. apps/web's theme never defines
 * `--color-background`, so `bg-background`, `sm:bg-background/96`,
 * `text-background`, `bg-background-elevated`, ... compile to nothing and the
 * element silently loses its color (account/billing layouts and the auth modal
 * rendered with no page background). Use `bg-base` for the page background,
 * `bg-surface-elevated` for elevated surfaces, and `text-(--color-bg-base)` for
 * base-colored text on an inverted (`bg-foreground`) fill.
 *
 * `text-foreground` / `bg-foreground` are fine: `--color-foreground` is an
 * alias of `--color-text-primary-token` in styles/tailwind-foundation.css.
 */

const WEB_ROOT = join(import.meta.dirname, '..', '..', '..');
const SCAN_DIRS = ['app', 'components', 'lib', 'hooks'] as const;
const THEME_CSS_FILES = [
  'styles/tailwind-foundation.css',
  'app/globals.css',
] as const;
const SOURCE_EXT = /\.(tsx|ts|jsx|js)$/;
const TEST_FILE = /\.(test|spec|stories)\.(tsx|ts|jsx|js)$/;

/** Color family names that are NOT defined as `--color-<name>` in the theme. */
const UNDEFINED_COLOR_FAMILIES = ['background'] as const;

const COLOR_UTILITY_PREFIXES = [
  'bg',
  'text',
  'border(?:-[trblxyse])?',
  'ring',
  'ring-offset',
  'outline',
  'divide',
  'from',
  'via',
  'to',
  'fill',
  'stroke',
  'shadow',
  'placeholder',
  'caret',
  'accent',
  'decoration',
] as const;

// Shrink-only. Do not add entries; fix the class instead.
const TEMPORARY_ALLOWLIST = [
  // TODO(#18551): remove once the desktop-auth handoff PR swaps its tokens.
  'app/(auth)/DesktopAuthRouteHandoff.tsx',
  'app/desktop-auth/',
  // TODO: these files carry unrelated pre-existing ESLint debt
  // (canonical-ui-label-casing, shadcn/no-restyle) that blocks any staged
  // edit. Swap ring-offset-background -> ring-offset-base and
  // text-background -> text-(--color-bg-base) when that debt is cleared.
  'components/features/dashboard/molecules/UniversalLinkInputPlatformSelector.tsx',
  'components/features/dashboard/organisms/release-provider-matrix/ReleasePlanWizard.tsx',
  // TODO: these are in-scope screens without a screen-certification
  // registration, so any edit trips screen-registration-gate (JOV-INV-018).
  // Swap bg-background -> bg-base in the follow-up that registers them.
  'app/account/layout.tsx',
  'app/billing/layout.tsx',
  'app/waitlist/error.tsx',
] as const;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(full, out);
    } else if (SOURCE_EXT.test(entry.name) && !TEST_FILE.test(entry.name)) {
      out.push(full);
    }
  }
}

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

function isAllowlisted(relPath: string): boolean {
  return TEMPORARY_ALLOWLIST.some(entry =>
    entry.endsWith('/') ? relPath.startsWith(entry) : relPath === entry
  );
}

function buildUtilityPattern(family: string): RegExp {
  const prefixes = COLOR_UTILITY_PREFIXES.join('|');
  // Preceded by start, whitespace, a quote/backtick or a variant colon so
  // CSS custom properties (`--sidebar-background`) never match.
  return new RegExp(
    String.raw`(?:^|[\s'"\x60:!])((?:${prefixes})-${family}(?:-[a-z0-9]+)*(?:\/[0-9]+)?)(?![\w-])`,
    'g'
  );
}

function findUndefinedColorUtilities(
  source: string,
  families: readonly string[] = UNDEFINED_COLOR_FAMILIES
): string[] {
  const hits: string[] = [];
  for (const family of families) {
    for (const match of source.matchAll(buildUtilityPattern(family))) {
      hits.push(match[1]);
    }
  }
  return hits;
}

describe('undefined Tailwind color utility guard', () => {
  it('guarded color families are really absent from the Tailwind theme', () => {
    const themeCss = THEME_CSS_FILES.map(file =>
      readFileSync(join(WEB_ROOT, file), 'utf8')
    ).join('\n');
    for (const family of UNDEFINED_COLOR_FAMILIES) {
      // If this fails, the family became a real token: drop it from the list.
      expect(themeCss).not.toMatch(new RegExp(String.raw`--color-${family}\b`));
    }
  });

  it('detects undefined color utilities with variants and opacity', () => {
    expect(
      findUndefinedColorUtilities(
        "className='bg-background sm:bg-background/96 text-background hover:border-background bg-background-elevated'"
      )
    ).toEqual([
      'bg-background',
      'bg-background/96',
      'text-background',
      'border-background',
      'bg-background-elevated',
    ]);
    expect(
      findUndefinedColorUtilities(
        "className='bg-base text-foreground bg-foreground text-(--color-bg-base)' --sidebar-background"
      )
    ).toEqual([]);
  });

  it('web source never uses color utilities the theme does not define', () => {
    const files: string[] = [];
    for (const dir of SCAN_DIRS) walk(join(WEB_ROOT, dir), files);

    const offenders: string[] = [];
    for (const file of files) {
      const relPath = toPosix(relative(WEB_ROOT, file));
      if (isAllowlisted(relPath)) continue;
      const hits = findUndefinedColorUtilities(readFileSync(file, 'utf8'));
      if (hits.length > 0) offenders.push(`${relPath}: ${hits.join(', ')}`);
    }

    expect(
      offenders,
      'These Tailwind color utilities emit no CSS (no --color-* token). ' +
        'Use bg-base / bg-surface-elevated / text-(--color-bg-base) instead.'
    ).toEqual([]);
  });
});
