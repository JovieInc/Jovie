// JOV-INV-047 consumer.
// Price lock guard (Tim, 2026-10-29): a person with a lock sees and pays ONE
// price everywhere, their locked price. Hard legal invariant.
//
// 1. Static: no price-rendering or checkout path may read the list price
//    (PLAN_PRICES, offer monthlyUsd, active price mappings, list Stripe ids)
//    unless it is on the allowlist below with a reason. The allowlist only
//    shrinks (a count per file); a new reader fails CI until it resolves the
//    price through the lock or is justified here.
// 2. Behavioral: with a $19 list and a $12 lock, every resolver that serves a
//    person answers $12.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveCheckoutPrice } from '@/lib/billing/price-lock-checkout';
import {
  applyPriceLockToOptions,
  buildPriceLockView,
  lockedMonthlyLabel,
} from '@/lib/billing/price-lock-view';
import {
  buildPriceLockSnapshot,
  type PriceVersion,
  resolveLockedPrice,
} from '@/lib/billing/price-versions';
import { formatVerifiedUpgradeLabel } from '@/lib/billing/verified-upgrade';

const WEB_ROOT = join(__dirname, '../../..');
const ROOTS = [
  'app',
  'components',
  'constants',
  'data',
  'hooks',
  'lib',
] as const;
const SKIP = /\.(?:test|spec|stories)\.|\/__snapshots__\/|\/tests?\/|fixtures?/;
const SOURCE = /\.(?:ts|tsx)$/;

/** Reads of the current list price. */
const LIST_PRICE_READ =
  /\bPLAN_PRICES\b|ARTIST_VISIBILITY_OFFER\s*\.\s*pro\s*\.\s*monthlyUsd|ARTIST_VISIBILITY_OFFER\.pro\b|\bgetAvailablePricing\s*\(|\bACTIVE_PRICE_MAPPINGS\b|\bgetActivePriceIds\s*\(|\bgetListStripePriceIds\s*\(|\bgetCurrentPriceVersion\s*\(|\bCANONICAL_PRO_MONTHLY_USD\b|\bCURRENT_PRICE_VERSION_ID\b/g;

/** Inline escape for a line that is deliberately a list-price read. */
const INLINE_ALLOW = /price-lock-allow:/;

/**
 * Files that may read the list price, with the maximum number of reads and why
 * none of them serves a per-person price. Shrink only.
 */
const ALLOWED: Readonly<Record<string, { max: number; why: string }>> = {
  'lib/config/plan-prices.ts': { max: 3, why: 'owner of the list price' },
  'lib/config/pricing.ts': {
    max: 8,
    why: 'list pricing table derived from the owner',
  },
  'lib/entitlements/registry.ts': {
    max: 4,
    why: 'plan matrix marketing metadata, not a quote',
  },
  'constants/plans.ts': { max: 1, why: 're-export of the owner' },
  'lib/stripe/config.ts': {
    max: 10,
    why: 'active-price mappings: the list of what new subscribers can buy',
  },
  'lib/stripe/plan-change.ts': {
    max: 10,
    why: 'plan-change catalogue; the person route resolves the lock first (plan-change route tests)',
  },
  'lib/stripe/price-contract.ts': {
    max: 3,
    why: 'checks Stripe against the active mapping or the lock expectation',
  },
  'lib/stripe/startup-validation.ts': {
    max: 2,
    why: 'deploy-time config check',
  },
  'lib/stripe/test-price-contract.ts': {
    max: 3,
    why: 'test-mode price contract check',
  },
  'app/api/billing/health/route.ts': {
    max: 2,
    why: 'operator health of the active price ids',
  },
  'app/api/stripe/pricing-options/route.ts': {
    max: 2,
    why: 'public, anonymous list; signed-in clients apply the lock (usePricingOptionsQuery)',
  },
  'app/api/stripe/checkout/route.ts': {
    max: 3,
    why: 'validates list ids only for people whose lock does not apply',
  },
  'lib/billing/price-versions.ts': {
    max: 12,
    why: 'the price version registry and lock resolver',
  },
  'lib/billing/price-lock.server.ts': {
    max: 3,
    why: 'builds a new signup lock from the current list version',
  },
  'lib/billing/price-assignment.ts': {
    max: 6,
    why: 'experiment assignment; existing payers and lock holders are grandfathered by input',
  },
  'lib/billing/offer-truth.ts': {
    max: 3,
    why: 'public anonymous offer claims',
  },
  'lib/billing/offer/offer.ts': { max: 2, why: 'public anonymous offer' },
  'lib/billing/commerce/support-matrix.ts': {
    max: 5,
    why: 'public agentic-commerce catalogue, anonymous',
  },
  'lib/billing/commerce/rail-decisions.ts': {
    max: 2,
    why: 'internal rail decision record',
  },
  'lib/acquisition/canonical-artist-site-certification.ts': {
    max: 6,
    why: 'internal certification of the public offer',
  },
  'lib/acquisition/proof-claim-funnel.ts': {
    max: 3,
    why: 'anonymous pre-signup funnel figure',
  },
  'lib/canaries/m2-revenue-path.ts': {
    max: 2,
    why: 'synthetic canary of the list price',
  },
  'lib/visibility-audit/offer.ts': {
    max: 2,
    why: 'public one-time audit copy',
  },
  'data/marketing/renderedCopyCoverage.ts': {
    max: 2,
    why: 'copy coverage fixture of the public claim',
  },
  'components/features/auth/AuthOfferSummary.tsx': {
    max: 3,
    why: 'pre-auth sign-up recap: a new signup is locked to this list price',
  },
};

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (SOURCE.test(name) && !SKIP.test(path)) out.push(path);
  }
  return out;
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

export function countListPriceReads(source: string): number {
  const raw = source.split('\n');
  const stripped = stripComments(source).split('\n');
  let count = 0;
  stripped.forEach((line, i) => {
    const hits = line.match(LIST_PRICE_READ)?.length ?? 0;
    if (!hits) return;
    // The allow marker may sit on the line or in the comment block above it.
    const window = raw.slice(Math.max(0, i - 4), i + 1).join('\n');
    if (INLINE_ALLOW.test(window)) return;
    count += hits;
  });
  return count;
}

function scan(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const root of ROOTS) {
    for (const file of walk(join(WEB_ROOT, root), [])) {
      const n = countListPriceReads(readFileSync(file, 'utf8'));
      if (n > 0) counts[relative(WEB_ROOT, file)] = n;
    }
  }
  return counts;
}

describe('price lock guard: no list-price read for a person with a lock', () => {
  it('detects list-price reads (deliberate red)', () => {
    expect(countListPriceReads('const p = PLAN_PRICES.pro.monthly;')).toBe(1);
    expect(
      countListPriceReads('const p = ARTIST_VISIBILITY_OFFER.pro.monthlyUsd;')
    ).toBe(1);
    expect(countListPriceReads('const o = getAvailablePricing();')).toBe(1);
    expect(countListPriceReads('// PLAN_PRICES in a comment')).toBe(0);
    expect(
      countListPriceReads(
        '// price-lock-allow: pre-auth recap\nconst p = PLAN_PRICES.pro.monthly;'
      )
    ).toBe(0);
  });

  it('only allowlisted files read the list price, and never more than their cap', () => {
    const counts = scan();
    const violations = Object.entries(counts)
      .filter(([file, n]) => n > (ALLOWED[file]?.max ?? 0))
      .map(
        ([file, n]) =>
          `${file}: ${n} list-price read(s) (allowed ${ALLOWED[file]?.max ?? 0}). Resolve the price for a person through resolveLockedPrice / the price lock (lib/billing/price-versions.ts), or justify an allowlist entry.`
      );
    expect(violations).toEqual([]);
  });

  it('shrinks the allowlist when a reader is removed', () => {
    const counts = scan();
    const stale = Object.entries(ALLOWED)
      .filter(([file, a]) => (counts[file] ?? 0) < a.max)
      .map(
        ([file, a]) =>
          `${file}: allowed ${a.max}, found ${counts[file] ?? 0}. Lower the cap.`
      );
    expect(stale).toEqual([]);
  });

  it('every allowlist entry says why it is not a per-person price', () => {
    for (const [file, a] of Object.entries(ALLOWED)) {
      expect(a.why.length, file).toBeGreaterThan(10);
    }
  });
});

describe('price lock guard: every person-facing path answers the locked price', () => {
  // World after JOV-9769: list is $19/mo, this person locked $12/mo.
  const V12: PriceVersion = {
    id: 'v12',
    plan: 'pro',
    monthlyUsd: 12,
    yearlyUsd: null,
    currency: 'usd',
    introducedOn: '2026-10-20',
  };
  const V19: PriceVersion = {
    ...V12,
    id: 'v19',
    monthlyUsd: 19,
    yearlyUsd: 190,
  };
  const lock = buildPriceLockSnapshot({
    source: 'signup',
    now: new Date('2026-10-29T00:00:00.000Z'),
    stripePriceIds: { monthly: 'price_12', yearly: null },
    versions: [V12, V19],
    currentId: 'v12',
  });
  const view = buildPriceLockView(lock);
  const listOptions = [
    {
      priceId: 'price_19',
      amount: 1900,
      currency: 'usd',
      interval: 'month',
      description: 'Artist Presence',
      plan: 'pro',
    },
  ];

  it('quotes (API and pricing page)', () => {
    expect(lockedMonthlyLabel(view)).toBe('$12/mo');
    expect(
      resolveLockedPrice({
        lock,
        interval: 'month',
        versions: [V12, V19],
        currentId: 'v19',
      })
    ).toMatchObject({ amountCents: 1200, locked: true });
  });

  it('in-app paywall and user menu label', () => {
    const options = applyPriceLockToOptions(listOptions, view);
    expect(formatVerifiedUpgradeLabel(options[0])).toBe(
      'Get Verified — $12/mo'
    );
  });

  it('checkout and plan change', () => {
    expect(
      resolveCheckoutPrice({
        requestedPriceId: 'price_19',
        requestedMapping: { plan: 'pro', interval: 'month' },
        lock,
      })
    ).toMatchObject({ kind: 'locked', priceId: 'price_12' });
  });

  it('a person without a lock gets the list price', () => {
    expect(
      resolveLockedPrice({
        lock: null,
        interval: 'month',
        versions: [V12, V19],
        currentId: 'v19',
      })
    ).toMatchObject({ amountCents: 1900, locked: false });
  });
});
