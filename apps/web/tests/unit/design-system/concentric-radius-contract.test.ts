import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateShrinkOnlyCount } from '@/lib/design/shrink-only-count-ratchet';
import {
  deriveSystemBInnerRadiusPx,
  resolveSystemBRadiusPx,
  SYSTEM_B_CONCENTRIC_SURFACES,
  SYSTEM_B_RADIUS_PX,
  SYSTEM_B_SURFACE_INSET_PX,
} from '@/lib/design/system-b-radius';
import {
  ARBITRARY_RADIUS,
  isDerivedRadius,
  measureArbitraryRadius,
} from '../../../scripts/optical-grid-scanners';

const APP_ROOT = join(__dirname, '../../..');
const REPO_ROOT = join(APP_ROOT, '../..');
const RADIUS_BASELINE_PATH = join(__dirname, 'arbitrary-radius.baseline.json');

const uniformInset = (value: number) => ({
  top: value,
  right: value,
  bottom: value,
  left: value,
});

describe('System B role geometry (shadow; no rendered consumer gate)', () => {
  it('keeps the viewport frame square without squaring floating surfaces or controls', () => {
    expect(resolveSystemBRadiusPx({ role: 'edge-attached-frame' })).toBe(0);
    expect(
      resolveSystemBRadiusPx({
        role: 'rounded-surface',
        surface: 'panel',
        visibleSize: { width: 224, height: 600 },
      })
    ).toBe(24);
    expect(
      resolveSystemBRadiusPx({
        role: 'capsule-control',
        visibleSize: { width: 80, height: 28 },
      })
    ).toBe(14);
  });

  it('derives the existing semantic pairs from their actual border-box inset', () => {
    for (const surface of ['card', 'overlay', 'panel'] as const) {
      const pair = SYSTEM_B_CONCENTRIC_SURFACES[surface];
      expect(
        resolveSystemBRadiusPx({
          role: 'inset-surface',
          surface,
          relationship: 'nested-parallel',
          outerVisibleSize: { width: 100, height: 100 },
          insetPx: uniformInset(SYSTEM_B_SURFACE_INSET_PX[pair.inset]),
        })
      ).toBe(SYSTEM_B_RADIUS_PX[pair.inner]);
    }
    // 1px outer border + 4px padding = 5px between the two border edges.
    expect(
      resolveSystemBRadiusPx({
        role: 'inset-surface',
        surface: 'card',
        relationship: 'nested-parallel',
        outerVisibleSize: { width: 100, height: 100 },
        insetPx: uniformInset(5),
      })
    ).toBe(11);
  });

  it('clamps outer arcs to the visible box, and inner arcs to zero', () => {
    expect(
      resolveSystemBRadiusPx({
        role: 'inset-surface',
        surface: 'panel',
        relationship: 'nested-parallel',
        outerVisibleSize: { width: 100, height: 28 },
        insetPx: uniformInset(4),
      })
    ).toBe(10);
    expect(
      resolveSystemBRadiusPx({
        role: 'inset-surface',
        surface: 'card',
        relationship: 'nested-parallel',
        outerVisibleSize: { width: 100, height: 100 },
        insetPx: uniformInset(20),
      })
    ).toBe(0);
  });

  it('keeps a 28px visible pill at radius 14 inside a 44px hit target', () => {
    for (const hitTargetHeight of [44, 48]) {
      const control = {
        visibleSize: { width: 80, height: 28 },
        hitTargetHeight,
      };
      expect(
        resolveSystemBRadiusPx({ role: 'capsule-control', ...control })
      ).toBe(14);
    }
    expect(
      resolveSystemBRadiusPx({
        role: 'circle-control',
        visibleSize: { width: 28, height: 28 },
      })
    ).toBe(14);
    expect(
      resolveSystemBRadiusPx({
        role: 'capsule-control',
        visibleSize: { width: 20, height: 80 },
      })
    ).toBe(10);
  });

  it.each(['adjacent', 'uncontained'] as const)(
    'rejects false concentric %s relationships',
    relationship => {
      expect(() =>
        resolveSystemBRadiusPx({
          role: 'inset-surface',
          surface: 'card',
          relationship,
          outerVisibleSize: { width: 100, height: 100 },
          insetPx: uniformInset(4),
        })
      ).toThrow('Only nested parallel');
    }
  );

  it('rejects unsupported elliptical corners and unequal insets', () => {
    const geometry = {
      relationship: 'nested-parallel' as const,
      outerRadiusPx: { x: 16, y: 16 },
      insetPx: uniformInset(4),
    };
    expect(() =>
      deriveSystemBInnerRadiusPx({
        ...geometry,
        outerRadiusPx: { x: 16, y: 12 },
      })
    ).toThrow('Only circular corners');
    expect(() =>
      deriveSystemBInnerRadiusPx({
        ...geometry,
        insetPx: { ...uniformInset(4), left: 5 },
      })
    ).toThrow('Only circular corners');
    expect(() =>
      deriveSystemBInnerRadiusPx({
        ...geometry,
        outerRadiusPx: { x: 9999, y: 9999 },
      })
    ).toThrow('Resolve CSS saturation');
  });

  it.each([-1, NaN, Infinity])('rejects invalid measurements (%s)', invalid => {
    expect(() =>
      deriveSystemBInnerRadiusPx({
        relationship: 'nested-parallel',
        outerRadiusPx: { x: invalid, y: invalid },
        insetPx: uniformInset(4),
      })
    ).toThrow('finite and nonnegative');
    expect(() =>
      deriveSystemBInnerRadiusPx({
        relationship: 'nested-parallel',
        outerRadiusPx: { x: 16, y: 16 },
        insetPx: uniformInset(invalid),
      })
    ).toThrow('finite and nonnegative');
    expect(() =>
      resolveSystemBRadiusPx({
        role: 'capsule-control',
        visibleSize: { width: 80, height: invalid },
      })
    ).toThrow('finite and positive');
  });

  it('rejects collapsed surfaces and rectangular circles', () => {
    expect(() =>
      resolveSystemBRadiusPx({
        role: 'inset-surface',
        surface: 'card',
        relationship: 'nested-parallel',
        outerVisibleSize: { width: 32, height: 32 },
        insetPx: uniformInset(16),
      })
    ).toThrow('finite and positive');
    expect(() =>
      resolveSystemBRadiusPx({
        role: 'circle-control',
        visibleSize: { width: 44, height: 28 },
      })
    ).toThrow('equal visible dimensions');
    expect(() =>
      resolveSystemBRadiusPx({
        role: 'circle-control',
        visibleSize: { width: 0, height: 0 },
      })
    ).toThrow('finite and positive');
  });
});

describe('System B concentric radius contract', () => {
  it('keeps every outer radius equal to its inner radius plus its inset', () => {
    for (const [surface, geometry] of Object.entries(
      SYSTEM_B_CONCENTRIC_SURFACES
    )) {
      expect(
        SYSTEM_B_RADIUS_PX[geometry.outer],
        `${surface} outer radius`
      ).toBe(
        SYSTEM_B_RADIUS_PX[geometry.inner] +
          SYSTEM_B_SURFACE_INSET_PX[geometry.inset]
      );
    }
  });

  it('defines the shared CSS aliases from existing radius and spacing tokens', () => {
    const css = readFileSync(
      join(APP_ROOT, 'styles/design-system.css'),
      'utf-8'
    );

    expect(css).toContain('--system-b-radius-card: var(--radius-xl);');
    expect(css).toMatch(
      /--system-b-radius-card-inner:\s*calc\(\s*var\(--system-b-radius-card\)\s*-\s*var\(--space-1\)\s*\)/
    );
    expect(css).toContain('--system-b-radius-overlay: var(--radius-xl);');
    expect(css).toMatch(
      /--system-b-radius-overlay-inner:\s*calc\(\s*var\(--system-b-radius-overlay\)\s*-\s*var\(--space-1\)\s*\)/
    );
    expect(css).toContain('--system-b-radius-panel: var(--radius-3xl);');
    expect(css).toMatch(
      /--system-b-radius-panel-inner:\s*calc\(\s*var\(--system-b-radius-panel\)\s*-\s*var\(--space-1\)\s*\)/
    );
  });

  it('routes shared card and overlay containers through semantic aliases', () => {
    const card = readFileSync(
      join(REPO_ROOT, 'packages/ui/atoms/card.tsx'),
      'utf-8'
    );
    const dropdown = readFileSync(
      join(REPO_ROOT, 'packages/ui/lib/dropdown-styles.ts'),
      'utf-8'
    );
    const overlay = readFileSync(
      join(REPO_ROOT, 'packages/ui/lib/overlay-styles.ts'),
      'utf-8'
    );
    const themeTokens = readFileSync(
      join(REPO_ROOT, 'packages/ui/theme/tokens.ts'),
      'utf-8'
    );

    expect(card).toContain('rounded-(--system-b-radius-card)');
    expect(card).not.toContain('rounded-[');
    expect(dropdown).toContain('rounded-(--system-b-radius-overlay)');
    expect(dropdown).toContain('rounded-(--system-b-radius-overlay-inner)');
    expect(dropdown).not.toContain('rounded-[');
    expect(overlay).toContain('rounded-(--system-b-radius-panel)');
    expect(overlay).not.toContain('rounded-[');
    expect(themeTokens).toContain('export const concentricRadii');
    expect(themeTokens).toContain('var(--system-b-radius-card-inner)');
  });
});

describe('arbitrary radius outside the concentric registry (shrink-only)', () => {
  const measured = measureArbitraryRadius();

  // Checks require the committed floor and never create or approve a new one.
  const baseline = JSON.parse(readFileSync(RADIUS_BASELINE_PATH, 'utf8')) as {
    count: number;
    files: number;
  };

  it('does not add rounded-[…] values that fork the radius scale', () => {
    const verdict = evaluateShrinkOnlyCount({
      count: measured.count,
      baseline: baseline.count,
      metric: 'arbitrary radius values outside the concentric registry',
    });
    if (!verdict.ok && verdict.status === 'regression') {
      const top = [...measured.perFile.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([file, n]) => `  ${file}: ${n}`)
        .join('\n');
      expect.fail(
        `${verdict.message}\nUse rounded-xl / rounded-3xl / rounded-(--system-b-radius-*) ` +
          `or derive from calc(var(--radius-*) ± var(--space-*)).\nTop files:\n${top}`
      );
    }
    if (!verdict.ok) {
      expect.fail(
        `${verdict.message} Lower "count" in arbitrary-radius.baseline.json ` +
          `to ${measured.count} (files ${measured.files}) in this PR.`
      );
    }
    expect(verdict.ok).toBe(true);
  });

  it('treats only calc(var(--radius-*) ± var(--space-*)) as derived', () => {
    expect(isDerivedRadius('calc(var(--radius-lg)+var(--space-1))')).toBe(true);
    expect(isDerivedRadius('calc(var(--radius-lg)_+_var(--space-1))')).toBe(
      true
    );
    expect(isDerivedRadius('calc(var(--radius-lg)_-_var(--space-1))')).toBe(
      true
    );
    expect(isDerivedRadius('calc(var(--radius-lg)_+_3px)')).toBe(false);
    expect(isDerivedRadius('calc(var(--radius-3xl) - var(--space-1))')).toBe(
      true
    );
    expect(isDerivedRadius('calc(var(--radius-3xl)-0.375rem)')).toBe(false);
    expect(isDerivedRadius('2rem')).toBe(false);
    expect(isDerivedRadius('28px')).toBe(false);
    expect(isDerivedRadius('inherit')).toBe(false);
  });

  it('never matches named radius utilities (locked atoms stay untouched)', () => {
    const source =
      "'rounded-full rounded-pill rounded-xl rounded-(--system-b-radius-card) rounded-t-3xl'";
    expect([...source.matchAll(ARBITRARY_RADIUS)]).toHaveLength(0);
    const arbitrary =
      "'rounded-[2rem] rounded-t-[1.1rem] rounded-[calc(var(--radius-lg)+var(--space-1))]'";
    const hits = [...arbitrary.matchAll(ARBITRARY_RADIUS)].filter(
      m => !isDerivedRadius(m[1])
    );
    expect(hits).toHaveLength(2);
  });
});
