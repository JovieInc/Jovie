import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  classifySpacingFamily,
  measureSpacingScale,
  SPACING_SCALE_FAMILIES,
  type SpacingScaleFamily,
} from '@/lib/design/optical-grid-scanners';
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
 *     warns; strict activation is outside this conservative guard change.
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
const BASELINE_PATH = join(__dirname, 'spacing-scale.baseline.json');

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

  // Checks require the committed floor and never create or approve a new one.
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
    const root = mkdtempSync(join(tmpdir(), 'spacing-utility-contract-'));
    try {
      const dir = join(root, 'apps/web/components');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'Fixture.tsx'), source);
      writeFileSync(join(dir, 'Ignored.test.tsx'), 'px-3.5');
      mkdirSync(join(dir, '.next'));
      writeFileSync(join(dir, '.next/Ignored.tsx'), 'px-3.5');
      const measured = measureSpacingScale(root);
      return {
        strict: measured.strict.count,
        conservative: measured.conservative.count,
      };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
