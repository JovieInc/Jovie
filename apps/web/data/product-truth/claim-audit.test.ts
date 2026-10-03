import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';
import {
  auditCopyClaims,
  collectStrings,
  compareToBaseline,
  findUncertifiedWebResearchClaims,
  isClaimBearing,
  resolvesToClaim,
} from './claim-audit';
import { listProductTruthClaims } from './claims';
import { type Claim, PRODUCT_CAPABILITIES } from './registry';

/**
 * Claim coverage over existing marketing copy. Unresolved claim-bearing
 * strings live in `claim-coverage-baseline.json`, which may only shrink:
 * new unbacked claims fail, and resolved ones must be removed from the file.
 * `UPDATE_PRODUCT_TRUTH_BASELINE=1` removes stale keys; it never adds.
 */

const copyModules = {
  ...import.meta.glob('../*Copy.ts', { eager: true }),
  ...import.meta.glob('../marketingPricingPlans.ts', { eager: true }),
} as Record<string, unknown>;

const BASELINE_PATH = path.join(__dirname, 'claim-coverage-baseline.json');

interface Baseline {
  readonly description: string;
  readonly unresolved: Readonly<Record<string, string>>;
}

function moduleMap(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(copyModules).map(([file, exports]) => [
      `apps/web/data/${path.basename(file)}`,
      exports,
    ])
  );
}

const claim = (statement: string): Claim => ({
  id: 'fixture.claim',
  capabilityId: 'public-profile',
  statement,
  kind: 'capability',
  source: 'feature',
});

describe('claim audit primitives', () => {
  it('flags money, percentages, multipliers, counts, and comparisons', () => {
    expect(isClaimBearing('Only $9/mo for everything')).toBe(true);
    expect(isClaimBearing('Grow reach 40%')).toBe(true);
    expect(isClaimBearing('3x more saves')).toBe(true);
    expect(isClaimBearing('Trusted by 10,000 artists')).toBe(true);
    expect(isClaimBearing('Faster than the old way')).toBe(true);
    expect(isClaimBearing('The best link in bio')).toBe(true);
  });

  it('ignores plain copy and letterless values', () => {
    expect(isClaimBearing('Claim your profile')).toBe(false);
    expect(isClaimBearing('$10')).toBe(false);
    expect(isClaimBearing('')).toBe(false);
  });

  it('resolves exact and quoted statements, but not short partial ones', () => {
    const claims = [claim('Unlimited smart links'), claim('$0')];
    expect(resolvesToClaim('unlimited  smart links', claims)).toBe(true);
    expect(resolvesToClaim('Get unlimited smart links today', claims)).toBe(
      true
    );
    expect(resolvesToClaim('$0', claims)).toBe(true);
    expect(resolvesToClaim('Save $0 to $50 a month', claims)).toBe(false);
  });

  it('collects nested strings once and tolerates cycles', () => {
    const cyclic: Record<string, unknown> = { a: 'one', b: ['two', 3, null] };
    cyclic.self = cyclic;
    expect(collectStrings(cyclic)).toEqual(['one', 'two']);
  });

  it('dedupes findings per file and sorts them by key', () => {
    const findings = auditCopyClaims(
      {
        'b.ts': { x: 'Up 40% overnight', y: 'Up 40% overnight' },
        'a.ts': ['3x reach'],
      },
      []
    );
    expect(findings.map(finding => finding.file)).toEqual(['a.ts', 'b.ts']);
  });

  it('compares findings to a baseline in both directions', () => {
    const findings = [{ key: 'a#1', file: 'a', text: 'x' }];
    expect(compareToBaseline(findings, ['a#1'])).toEqual({
      added: [],
      stale: [],
    });
    expect(compareToBaseline(findings, ['b#2'])).toEqual({
      added: findings,
      stale: ['b#2'],
    });
  });
});

describe('marketing copy claim coverage', () => {
  it('audits every copy module plus pricing data', () => {
    const files = Object.keys(moduleMap());
    expect(files).toContain('apps/web/data/marketingPricingPlans.ts');
    expect(files).toContain('apps/web/data/homepageV2Copy.ts');
  });

  it('unresolved claims only shrink against the committed baseline', () => {
    const findings = auditCopyClaims(moduleMap(), listProductTruthClaims());
    const baseline = JSON.parse(
      readFileSync(BASELINE_PATH, 'utf8')
    ) as Baseline;
    const { added, stale } = compareToBaseline(
      findings,
      Object.keys(baseline.unresolved)
    );

    if (process.env.UPDATE_PRODUCT_TRUTH_BASELINE === '1' && stale.length > 0) {
      const unresolved = Object.fromEntries(
        Object.entries(baseline.unresolved).filter(
          ([key]) => !stale.includes(key)
        )
      );
      writeFileSync(
        BASELINE_PATH,
        `${JSON.stringify({ ...baseline, unresolved }, null, 2)}\n`
      );
      return;
    }

    expect(
      added.map(finding => `${finding.key}: ${finding.text}`),
      'new claim-bearing copy must resolve to a product-truth claim (data/product-truth)'
    ).toEqual([]);
    expect(
      stale,
      'resolved claims: rerun with UPDATE_PRODUCT_TRUTH_BASELINE=1 to shrink the baseline'
    ).toEqual([]);
  });

  it('keeps internal-only web research out of public identity copy', () => {
    expect(PRODUCT_CAPABILITIES['profile-monitoring'].publication).toBe(
      'internal_only'
    );
    expect(
      PRODUCT_CAPABILITIES['profile-monitoring'].marketing
    ).toBeUndefined();

    const homepageSource = readFileSync(
      path.join(__dirname, '../homepageIdentityCopy.ts'),
      'utf8'
    );
    const companySource = readFileSync(
      path.join(__dirname, '../companyIdentity.ts'),
      'utf8'
    );
    expect(homepageSource).not.toContain('what the web says about you');
    expect(companySource).not.toContain('what the web says about you');

    const modules = {
      ...moduleMap(),
      'apps/web/data/companyIdentity.ts': { COMPANY_IDENTITY },
    };
    expect(findUncertifiedWebResearchClaims(modules)).toEqual([]);
    expect(COMPANY_IDENTITY.seoDescription).toBe(
      'Claim your name. Jovie makes you easy to reach, for people and for agents.'
    );

    const planted = findUncertifiedWebResearchClaims({
      'apps/web/data/exampleCopy.ts': {
        line: 'Jovie finds what the web says about you.',
      },
    });
    expect(planted).toHaveLength(1);
    expect(planted[0]?.file).toBe('apps/web/data/exampleCopy.ts');
    expect(planted[0]?.text).toContain('what the web says about you');
  });
});
