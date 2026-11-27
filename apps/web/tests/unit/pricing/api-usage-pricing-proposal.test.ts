import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  API_CACHE_CLASSES,
  API_USAGE_PRICING_FIELDS,
  API_USAGE_PRICING_PROPOSAL,
  type ApiWorkCache,
  type ApiWorkOutcome,
  admitApiWork,
  settleApiWork,
} from '@/lib/config/api-usage-pricing-proposal';

function readRepoFile(relativeToRepo: string): string {
  const fromPackage = resolve(process.cwd(), '../..', relativeToRepo);
  const fromRepo = resolve(process.cwd(), relativeToRepo);
  const path = existsSync(fromPackage) ? fromPackage : fromRepo;
  return readFileSync(path, 'utf8');
}

/** GitHub heading anchors drop punctuation, then collapse whitespace. */
function githubSlug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

const SCHEMA_HEADING = 'API pricing schema — proposal (JOV-4875)';

describe('API usage pricing proposal (JOV-4875)', () => {
  it('stays an unapproved proposal with billing and operator authority closed', () => {
    expect(API_USAGE_PRICING_PROPOSAL).toMatchObject({
      issue: 'JOV-4875',
      status: 'proposal',
      paidActivation: 'disabled',
      approval: 'unverified',
      currency: null,
      unitRate: null,
      includedUnits: null,
      numericLimits: null,
    });
    expect(API_USAGE_PRICING_PROPOSAL.identity).toEqual({
      operatorAuthority: false,
      adminAuthority: false,
      publicationAuthority: false,
      paymentAuthority: false,
      billingMutation: false,
      summerIdentityShared: false,
    });
    expect(API_USAGE_PRICING_PROPOSAL.fields).toEqual([
      'approval',
      'billable_unit',
      'billing_period',
      'cache_hits',
      'free_allowance',
      'limits',
      'overage',
      'spend_cap',
      'subsidy_exit',
    ]);
  });

  it('never serves stale cache classes or invents a TTL', () => {
    for (const policy of Object.values(API_CACHE_CLASSES)) {
      expect(policy.serveStale).toBe(false);
      expect(policy.ttl).toBeNull();
    }
    expect(API_CACHE_CLASSES.generated_output.crossTenant).toBe(false);
    expect(API_CACHE_CLASSES.negative_result.authDenialCached).toBe(false);
  });

  it('links the feature registry at the public schema heading', () => {
    const strategy = readRepoFile('docs/company/PRICING-STRATEGY.md');
    const registry = readRepoFile('docs/FEATURE_REGISTRY.md');
    const slug = githubSlug(SCHEMA_HEADING);

    expect(strategy).toContain(`## ${SCHEMA_HEADING}`);
    expect(slug).toBe('api-pricing-schema-proposal-jov-4875');
    expect(registry).toContain(`company/PRICING-STRATEGY.md#${slug}`);
    for (const field of API_USAGE_PRICING_FIELDS) {
      expect(strategy).toContain(`\`${field}\``);
    }
  });

  it('does not import a billing provider or embed an API price', () => {
    const source = readRepoFile(
      'apps/web/lib/config/api-usage-pricing-proposal.ts'
    );
    expect(source).not.toMatch(/^import /m);
    expect(source).not.toMatch(/\$\d/);
  });

  it('admits one free unit on a miss and reuses a fresh hit without upstream work', () => {
    const miss = admitApiWork({
      cache: 'miss',
      freeUnitsRemaining: 3,
      paidOptIn: false,
    });
    expect(miss).toMatchObject({
      admission: 'allow_free',
      billableUnits: 1,
      reservedUnits: 1,
      charge: false,
      checkout: false,
      serveCached: false,
      serveStale: false,
      invokeUpstream: true,
    });

    const hit = admitApiWork({
      cache: 'fresh_hit',
      freeUnitsRemaining: 1,
      paidOptIn: true,
    });
    expect(hit).toMatchObject({
      admission: 'allow_free',
      billableUnits: 1,
      reservedUnits: 1,
      charge: false,
      checkout: false,
      serveCached: true,
      invokeUpstream: false,
    });
  });

  it('replays a prior operation for free and refuses stale truth', () => {
    expect(
      admitApiWork({
        cache: 'replay',
        freeUnitsRemaining: 0,
        paidOptIn: true,
      })
    ).toMatchObject({
      admission: 'allow_replay',
      billableUnits: 0,
      reservedUnits: 0,
      serveCached: true,
      invokeUpstream: false,
      charge: false,
      checkout: false,
    });

    expect(
      admitApiWork({
        cache: 'stale_denied',
        freeUnitsRemaining: 10,
        paidOptIn: false,
      })
    ).toMatchObject({
      admission: 'deny_stale',
      billableUnits: 0,
      serveCached: false,
      serveStale: false,
      invokeUpstream: false,
      charge: false,
    });
  });

  it('stops at an unresolved or exhausted allowance and does not start checkout', () => {
    const exhausted = [null, 0, 0.5, Number.NaN, Number.POSITIVE_INFINITY];
    for (const freeUnitsRemaining of exhausted) {
      expect(
        admitApiWork({
          cache: 'miss',
          freeUnitsRemaining,
          paidOptIn: false,
        }).admission
      ).toBe('stop_free');
      expect(
        admitApiWork({
          cache: 'fresh_hit',
          freeUnitsRemaining,
          paidOptIn: true,
        })
      ).toMatchObject({
        admission: 'deny_unapproved_paid',
        billableUnits: 0,
        charge: false,
        checkout: false,
        invokeUpstream: false,
        serveCached: false,
      });
    }
  });

  it('consumes a unit only for a completed free admission', () => {
    const admitted = admitApiWork({
      cache: 'miss',
      freeUnitsRemaining: 2,
      paidOptIn: false,
    });
    expect(settleApiWork(admitted, 'completed')).toEqual({
      consumedUnits: 1,
      releaseReservation: false,
      charge: false,
    });

    const outcomes: ApiWorkOutcome[] = [
      'failed',
      'canceled',
      'unauthorized',
      'validation_blocked',
      'rate_limited',
    ];
    for (const outcome of outcomes) {
      expect(settleApiWork(admitted, outcome)).toEqual({
        consumedUnits: 0,
        releaseReservation: true,
        charge: false,
      });
    }

    const caches: ApiWorkCache[] = ['replay', 'stale_denied'];
    for (const cache of caches) {
      const denied = admitApiWork({
        cache,
        freeUnitsRemaining: 4,
        paidOptIn: true,
      });
      expect(settleApiWork(denied, 'completed').consumedUnits).toBe(0);
    }
  });
});
