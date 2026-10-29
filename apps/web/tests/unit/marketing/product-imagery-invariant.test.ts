import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  getProductShotManifestEntry,
  PRODUCT_SHOTS,
} from '@/lib/screenshots/product-shots';
import productShotManifest from '@/lib/screenshots/product-shots.manifest.json';
import { SCREENSHOT_SCENARIOS } from '@/lib/screenshots/registry';
import { expandVariants } from '@/scripts/product-shots/plan';
import { hashShotSpec } from '@/scripts/product-shots/source-hash.mjs';
import {
  ancestorJson,
  evaluateRatchet,
} from '../../../../../scripts/invariants/art-direction/ratchet.mjs';

/**
 * Art-direction invariant: marketing pages show product moments, not
 * full-viewport screenshots. A desktop scenario captured at page level
 * (1440x900 of mostly chrome and empty canvas) may not be referenced from
 * marketing source; use a registry product shot cropped to the moment
 * (`lib/screenshots/product-shots.ts`, `<ProductShot>`). Existing uses are a
 * shrink-only baseline.
 */

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const REPO_ROOT = resolve(WEB_ROOT, '../..');
const BASELINE = 'apps/web/tests/unit/marketing/product-imagery.baseline.json';

/** Source that renders marketing pages, including the data they read. */
const MARKETING_ROOTS = [
  'app/(marketing)',
  'app/(home)',
  'components/marketing',
  'components/homepage',
  'components/features/home',
  'components/features/pay',
  'data',
];
const SKIP = /\.(?:test|spec|stories)\.[jt]sx?$/;

function walk(absolute: string, out: string[]): string[] {
  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(absolute);
  } catch {
    return out;
  }
  if (stats.isFile()) {
    if (/\.[jt]sx?$/.test(absolute) && !SKIP.test(absolute)) out.push(absolute);
    return out;
  }
  for (const entry of readdirSync(absolute)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    walk(join(absolute, entry), out);
  }
  return out;
}

function isFullViewportDesktop(
  scenario: (typeof SCREENSHOT_SCENARIOS)[number]
): boolean {
  return (
    scenario.viewport === 'desktop' && scenario.captureTarget !== 'locator'
  );
}

export function fullViewportMarketingUses(): string[] {
  const fullViewport = SCREENSHOT_SCENARIOS.filter(isFullViewportDesktop);
  const uses = new Set<string>();
  for (const root of MARKETING_ROOTS) {
    for (const file of walk(join(WEB_ROOT, root), [])) {
      const source = readFileSync(file, 'utf8');
      const rel = relative(REPO_ROOT, file).split('\\').join('/');
      for (const scenario of fullViewport) {
        if (
          source.includes(`'${scenario.id}'`) ||
          source.includes(`"${scenario.id}"`)
        ) {
          uses.add(`${rel}#${scenario.id}`);
        }
      }
    }
  }
  return [...uses].sort();
}

describe('marketing product imagery', () => {
  it('uses no new full-viewport desktop screenshots (shrink-only)', () => {
    const recorded = JSON.parse(
      readFileSync(join(REPO_ROOT, BASELINE), 'utf8')
    ) as { ids: string[] };
    const ancestor = ancestorJson(REPO_ROOT, BASELINE);
    const errors = ancestor.ok
      ? evaluateRatchet({
          current: fullViewportMarketingUses(),
          recorded: recorded.ids,
          ancestor: ancestor.ancestor?.ids ?? null,
        })
      : [];
    expect(
      errors,
      'Replace full-viewport captures with a <ProductShot> cropped to one moment (lib/screenshots/product-shots.ts).'
    ).toEqual([]);
  });

  it('renders every declared shot from its current spec', () => {
    for (const spec of PRODUCT_SHOTS.flatMap(expandVariants)) {
      const entry = getProductShotManifestEntry(spec.id);
      expect(entry, `${spec.id} is not rendered`).not.toBeNull();
      expect(entry?.sources, `${spec.id} sources drifted`).toEqual(
        spec.sources
      );
      expect(
        entry?.specHash,
        `${spec.id} crop/route/viewport changed; run pnpm --filter @jovie/web shots:render --stale`
      ).toBe(hashShotSpec(spec));
    }
  });

  it('has no rendered shot without a spec', () => {
    const declared = new Set<string>(
      PRODUCT_SHOTS.flatMap(expandVariants).map(shot => shot.id)
    );
    const orphans = Object.keys(productShotManifest.shots).filter(
      id => !declared.has(id)
    );
    expect(orphans).toEqual([]);
  });

  it('declares only marketing routes as placements and unique ids', () => {
    const ids = PRODUCT_SHOTS.map(shot => shot.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const shot of PRODUCT_SHOTS) {
      expect(shot.route.startsWith('/demo/')).toBe(true);
      expect(shot.placements.length).toBeGreaterThan(0);
    }
  });
});
