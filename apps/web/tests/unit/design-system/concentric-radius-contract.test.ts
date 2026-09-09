import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateShrinkOnlyCount } from '@/lib/design/shrink-only-count-ratchet';
import {
  SYSTEM_B_CONCENTRIC_SURFACES,
  SYSTEM_B_RADIUS_PX,
  SYSTEM_B_SURFACE_INSET_PX,
} from '@/lib/design/system-b-radius';

const APP_ROOT = join(__dirname, '../../..');
const REPO_ROOT = join(APP_ROOT, '../..');
const RADIUS_BASELINE_PATH = join(__dirname, 'arbitrary-radius.baseline.json');

/**
 * D3 — arbitrary radius outside the concentric registry (JOV-5865).
 *
 * `rounded-[…]` is only on-system when it derives from the radius scale and
 * the spacing scale: `calc(var(--radius-*) ± var(--space-*))`. Every other
 * arbitrary radius (`rounded-[2rem]`, `rounded-[28px]`, `rounded-[7%]`) is a
 * second radius scale. Shrink-only: growth fails, remaining count never does.
 * Locked atoms (ActionButton r999 → `rounded-full` / `rounded-pill`) are
 * named utilities and never match.
 */
const ARBITRARY_RADIUS =
  /(?<![\w-])rounded(?:-(?:t|r|b|l|tl|tr|br|bl|s|e|ss|se|ee|es))?-\[([^\]]+)\]/g;
const DERIVED_RADIUS =
  /^calc\(var\(--radius-[a-z0-9-]+\)\s*[+-]\s*var\(--space-[a-z0-9-]+\)\)$/;
const RADIUS_SCAN_ROOTS = [
  'apps/web/app',
  'apps/web/components',
  'packages/ui',
] as const;
const RADIUS_SOURCE_EXT = /\.(tsx|ts)$/;
const RADIUS_NON_PRODUCT_FILE = /\.(test|spec|stories)\.[tj]sx?$/;
const RADIUS_SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'generated',
  'dist',
  'storybook-static',
]);

function walkRadiusFiles(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (RADIUS_SKIP_DIRS.has(entry.name)) continue;
      walkRadiusFiles(full, out);
    } else if (
      RADIUS_SOURCE_EXT.test(entry.name) &&
      !RADIUS_NON_PRODUCT_FILE.test(entry.name)
    ) {
      out.push(full);
    }
  }
}

export function isDerivedRadius(value: string): boolean {
  return DERIVED_RADIUS.test(value.trim());
}

export function measureArbitraryRadius(repoRoot = REPO_ROOT): {
  count: number;
  files: number;
  perFile: Map<string, number>;
} {
  const files: string[] = [];
  for (const root of RADIUS_SCAN_ROOTS)
    walkRadiusFiles(join(repoRoot, root), files);
  files.sort((a, b) => a.localeCompare(b));
  const perFile = new Map<string, number>();
  let count = 0;
  for (const file of files) {
    let hits = 0;
    for (const match of readFileSync(file, 'utf8').matchAll(ARBITRARY_RADIUS)) {
      if (isDerivedRadius(match[1])) continue;
      hits += 1;
    }
    if (hits > 0) {
      perFile.set(relative(repoRoot, file).split('\\').join('/'), hits);
      count += hits;
    }
  }
  return { count, files: perFile.size, perFile };
}

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

  // Self-seed on first run so the baseline and the count logic can never
  // diverge. Commit the seeded file; CI compares against it.
  if (!existsSync(RADIUS_BASELINE_PATH)) {
    writeFileSync(
      RADIUS_BASELINE_PATH,
      `${JSON.stringify(
        {
          $comment:
            'Shrink-only floor for rounded-[…] values not derived from calc(var(--radius-*) ± var(--space-*)) across apps/web/{app,components} + packages/ui (JOV-5865). Lower when a PR converges a radius onto the System B scale; never raise.',
          count: measured.count,
          files: measured.files,
        },
        null,
        2
      )}\n`
    );
  }

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
