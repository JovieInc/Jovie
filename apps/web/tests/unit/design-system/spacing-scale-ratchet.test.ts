import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateShrinkOnlyCount } from '@/lib/design/shrink-only-count-ratchet';

/**
 * Optical-grid spacing-scale ratchet (JOV-5865, parent JOV-3570).
 *
 * One 4px grid, company-wide. Tailwind spacing utilities whose numeric step
 * falls OFF the canonical scale (`px-3.5` = 14px, `p-2.5` = 10px, `gap-9`,
 * `py-1.5`, …) are optical drift. This ratchet counts them across the web
 * surfaces and the count may only go DOWN.
 *
 * Two tiers, same scan:
 *   - `conservative` (ARMED): the 10px / 14px steps (`*-2.5`, `*-3.5`) that
 *     compete directly with the 8/12/16 seam. Growth fails CI.
 *   - `strict` (REPORTED, not armed): every step outside the canonical set.
 *     Recorded per family so remediation waves can lower it; growth only
 *     warns until Tim thumbs the strict tier in Ops chat.
 *
 * Token resolution is never drift: `p-(--app-shell-content-padding-x)` and
 * `px-(--space-3)` carry no numeric step and therefore never match. That is
 * the ONLY allowlist — there is no per-file exception list.
 *
 * Ratchets fail on growth, never on remaining count. When a PR lowers a tier,
 * lower the matching numbers in spacing-scale.baseline.json in the same PR so
 * the floor follows the work down. Pattern mirrors
 * arbitrary-values-ratchet.test.ts + linear-namespace-ratchet.test.ts and the
 * shared merge-group-safe count policy (JOV-5300).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// tests/unit/design-system → apps/web
const WEB_ROOT = join(__dirname, '..', '..', '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');
const BASELINE_PATH = join(__dirname, 'spacing-scale.baseline.json');

/**
 * Canonical Tailwind steps on the 4px optical grid
 * (`ops/reviewed-invariants/optical-grid-consistent-v1`): 4, 8, 12, 16, 20,
 * 24, 32px and the 8px multiples above. Fractional steps and the odd /
 * in-between integers (7, 9, 11, 13, 14, 28, 36, 44, …) are a second scale.
 */
export const CANONICAL_SPACING_STEPS: ReadonlySet<string> = new Set([
  '0',
  'px',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '8',
  '10',
  '12',
  '16',
  '20',
  '24',
  '32',
  '40',
  '48',
  '56',
  '64',
  '72',
  '80',
  '96',
]);

/** Steps that compete with the seam directly: 10px and 14px. */
export const CONSERVATIVE_STEPS: ReadonlySet<string> = new Set(['2.5', '3.5']);

// Padding, margin, gap and space utilities followed by a numeric step.
// Negative utilities (`-mx-3.5`) count once. Token-resolved utilities
// (`p-(--…)`) and arbitrary values (`p-[13px]`) have no numeric step and are
// out of scope here (arbitrary values ride arbitrary-values-ratchet).
const SPACING_UTILITY =
  /(?<![\w-])-?(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y)-(\d+(?:\.\d+)?|px)(?![\w./%])/g;

const SOURCE_EXT = /\.(tsx|ts)$/;
const NON_PRODUCT_FILE = /\.(test|spec|stories)\.[tj]sx?$/;
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'generated',
  'dist',
  'storybook-static',
]);

export const SPACING_SCALE_FAMILIES = [
  'marketing',
  'web-shell',
  'web-other',
  'packages/ui',
] as const;
export type SpacingScaleFamily = (typeof SPACING_SCALE_FAMILIES)[number];

const SCAN_ROOTS = [
  'apps/web/app',
  'apps/web/components',
  'packages/ui',
] as const;

export function classifySpacingFamily(
  repoRelativePath: string
): SpacingScaleFamily {
  const p = repoRelativePath.split('\\').join('/');
  if (p.startsWith('packages/ui/')) return 'packages/ui';
  if (
    p.includes('/(marketing)/') ||
    p.includes('/(home)/') ||
    p.includes('/components/marketing/') ||
    p.includes('/components/homepage/') ||
    p.includes('/features/home/')
  ) {
    return 'marketing';
  }
  if (
    p.includes('/(shell)/') ||
    p.includes('/components/shell/') ||
    p.includes('/features/dashboard/') ||
    p.includes('/organisms/table/') ||
    p.includes('AppShell')
  ) {
    return 'web-shell';
  }
  return 'web-other';
}

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (
      SOURCE_EXT.test(entry.name) &&
      !NON_PRODUCT_FILE.test(entry.name)
    ) {
      out.push(full);
    }
  }
}

export interface SpacingScaleMeasurement {
  readonly strict: {
    readonly count: number;
    readonly perFamily: Record<SpacingScaleFamily, number>;
  };
  readonly conservative: {
    readonly count: number;
    readonly perFamily: Record<SpacingScaleFamily, number>;
    readonly perUtility: Record<string, number>;
  };
  readonly perFile: Map<string, number>;
}

function emptyFamilies(): Record<SpacingScaleFamily, number> {
  return { marketing: 0, 'web-shell': 0, 'web-other': 0, 'packages/ui': 0 };
}

export function measureSpacingScale(
  repoRoot = REPO_ROOT
): SpacingScaleMeasurement {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) walk(join(repoRoot, root), files);
  files.sort((a, b) => a.localeCompare(b));

  const strictPerFamily = emptyFamilies();
  const conservativePerFamily = emptyFamilies();
  const perUtility: Record<string, number> = {};
  const perFile = new Map<string, number>();
  let strict = 0;
  let conservative = 0;

  for (const file of files) {
    const rel = relative(repoRoot, file).split('\\').join('/');
    const family = classifySpacingFamily(rel);
    const source = readFileSync(file, 'utf8');
    let fileHits = 0;
    for (const match of source.matchAll(SPACING_UTILITY)) {
      const step = match[1];
      if (CANONICAL_SPACING_STEPS.has(step)) continue;
      strict += 1;
      strictPerFamily[family] += 1;
      fileHits += 1;
      if (CONSERVATIVE_STEPS.has(step)) {
        conservative += 1;
        conservativePerFamily[family] += 1;
        const utility = match[0].replace(/^-/, '');
        perUtility[utility] = (perUtility[utility] ?? 0) + 1;
      }
    }
    if (fileHits > 0) perFile.set(rel, fileHits);
  }

  return {
    strict: { count: strict, perFamily: strictPerFamily },
    conservative: {
      count: conservative,
      perFamily: conservativePerFamily,
      perUtility: Object.fromEntries(
        Object.entries(perUtility).sort(([a], [b]) => a.localeCompare(b))
      ),
    },
    perFile,
  };
}

interface SpacingScaleBaseline {
  readonly strict: {
    readonly armed: boolean;
    readonly count: number;
    readonly perFamily: Record<SpacingScaleFamily, number>;
  };
  readonly conservative: {
    readonly armed: boolean;
    readonly count: number;
    readonly perFamily: Record<SpacingScaleFamily, number>;
  };
}

function topFiles(perFile: Map<string, number>): string {
  return [...perFile.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([file, n]) => `  ${file}: ${n}`)
    .join('\n');
}

describe('optical-grid spacing-scale ratchet (shrink-only)', () => {
  const measured = measureSpacingScale();

  // Self-seed on first run so the baseline and the count logic can never
  // diverge. Commit the seeded file; CI compares against it.
  if (!existsSync(BASELINE_PATH)) {
    writeFileSync(
      BASELINE_PATH,
      `${JSON.stringify(
        {
          $comment:
            'Shrink-only floors for off-4px-grid Tailwind spacing steps (JOV-5865). Lower a number when a PR removes drift; never raise one. conservative (10px/14px steps) is armed: growth fails CI. strict is reported only until Tim thumbs it.',
          conservative: {
            armed: true,
            count: measured.conservative.count,
            perFamily: measured.conservative.perFamily,
            perUtility: measured.conservative.perUtility,
          },
          strict: {
            armed: false,
            count: measured.strict.count,
            perFamily: measured.strict.perFamily,
          },
        },
        null,
        2
      )}\n`
    );
  }

  const baseline = JSON.parse(
    readFileSync(BASELINE_PATH, 'utf8')
  ) as SpacingScaleBaseline;

  it('keeps the conservative tier (10px / 14px steps) from growing', () => {
    expect(baseline.conservative.armed).toBe(true);

    const verdict = evaluateShrinkOnlyCount({
      count: measured.conservative.count,
      baseline: baseline.conservative.count,
      metric: 'off-grid 10px/14px spacing steps (*-2.5, *-3.5)',
    });

    if (!verdict.ok && verdict.status === 'regression') {
      expect.fail(
        `${verdict.message}\n` +
          'Snap to the 4px grid (p-2 / p-3 / p-4) or resolve a token ' +
          '(px-(--app-shell-content-padding-x)).\n' +
          `Per utility: ${JSON.stringify(measured.conservative.perUtility)}\n` +
          `Top files:\n${topFiles(measured.perFile)}`
      );
    }
    if (!verdict.ok) {
      expect.fail(
        `${verdict.message} Lower conservative.count in ` +
          `spacing-scale.baseline.json to ${measured.conservative.count} in this PR.`
      );
    }
    expect(verdict.ok).toBe(true);
  });

  it('keeps every conservative family at or below its floor', () => {
    for (const family of SPACING_SCALE_FAMILIES) {
      expect(
        measured.conservative.perFamily[family],
        `${family} conservative spacing drift grew above its floor`
      ).toBeLessThanOrEqual(baseline.conservative.perFamily[family]);
    }
  });

  it('reports the strict tier per family (not armed until Tim thumbs it)', () => {
    expect(baseline.strict.armed).toBe(false);
    for (const family of SPACING_SCALE_FAMILIES) {
      expect(typeof baseline.strict.perFamily[family]).toBe('number');
    }
    const verdict = evaluateShrinkOnlyCount({
      count: measured.strict.count,
      baseline: baseline.strict.count,
      metric: 'strict off-grid spacing steps',
    });
    if (verdict.status === 'regression') {
      console.warn(
        `[spacing-scale-ratchet] strict tier grew (not armed): ${verdict.message}`
      );
    }
    // Strict is informational until armed; it can never fail CI here.
    expect(Number.isFinite(measured.strict.count)).toBe(true);
  });
});

describe('spacing-scale detector semantics', () => {
  function count(source: string): { strict: number; conservative: number } {
    let strict = 0;
    let conservative = 0;
    for (const match of source.matchAll(SPACING_UTILITY)) {
      if (CANONICAL_SPACING_STEPS.has(match[1])) continue;
      strict += 1;
      if (CONSERVATIVE_STEPS.has(match[1])) conservative += 1;
    }
    return { strict, conservative };
  }

  it('flags off-grid steps and counts negatives once', () => {
    expect(count("'px-3.5 py-2 -mx-2.5 gap-9 space-y-1.5'")).toEqual({
      strict: 4,
      conservative: 2,
    });
  });

  it('accepts the canonical 4px scale', () => {
    expect(
      count("'p-0 px-1 py-2 pl-3 m-4 gap-5 mt-6 mb-8 gap-x-10 p-12 px-px'")
    ).toEqual({ strict: 0, conservative: 0 });
  });

  it('never treats token resolution or arbitrary values as drift', () => {
    expect(
      count(
        "'p-(--app-shell-content-padding-x) px-(--space-3) py-[13px] gap-[var(--seam)]'"
      )
    ).toEqual({ strict: 0, conservative: 0 });
  });

  it('does not match non-spacing utilities that share a step suffix', () => {
    expect(count("'top-1.5 h-3.5 w-2.5 text-2xs rounded-2.5xl'")).toEqual({
      strict: 0,
      conservative: 0,
    });
  });

  it('classifies families by path', () => {
    expect(classifySpacingFamily('packages/ui/atoms/button.tsx')).toBe(
      'packages/ui'
    );
    expect(
      classifySpacingFamily('apps/web/app/(marketing)/pricing/page.tsx')
    ).toBe('marketing');
    expect(
      classifySpacingFamily('apps/web/components/features/home/Hero.tsx')
    ).toBe('marketing');
    expect(
      classifySpacingFamily(
        'apps/web/components/organisms/AppShellContentPanel.tsx'
      )
    ).toBe('web-shell');
    expect(
      classifySpacingFamily(
        'apps/web/app/app/(shell)/library/LibrarySurface.tsx'
      )
    ).toBe('web-shell');
    expect(
      classifySpacingFamily('apps/web/components/features/pay/PayLanding.tsx')
    ).toBe('web-other');
  });
});
