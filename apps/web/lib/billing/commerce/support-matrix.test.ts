import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ARTIST_VISIBILITY_OFFER, toCents } from '@/lib/config/plan-prices';
import { ACTIVE_PRICE_MAPPINGS, PRICE_MAPPINGS } from '@/lib/stripe/config';
import { PLATFORM_EVIDENCE } from './platform-evidence';
import {
  CHANNELS,
  COMMERCE_CLASSES,
  type PlatformEvidence,
  type SupportMatrix,
  type SupportRow,
  validateSupportMatrix,
} from './support-contract';
import { getCommerceSupportMatrix } from './support-matrix';

vi.mock('@/lib/env-server', () => ({
  env: {
    STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY: 'price_visibility_test',
    STRIPE_PRICE_YOUTUBE_THUMBNAILS_FOUNDER_MONTHLY: 'price_thumbnails_test',
  },
}));
const now = new Date('2026-10-15T18:00:00Z');
const matrix = () => getCommerceSupportMatrix(now);
function find(data: SupportMatrix, commerceClass: SupportRow['commerceClass']) {
  const result = data.rows.find(row => row.commerceClass === commerceClass);
  if (!result) throw new Error(`Missing test class ${commerceClass}`);
  return result;
}
function admitted() {
  const data = matrix();
  const pro = find(data, 'artist_visibility_pro');
  const receipt: PlatformEvidence = {
    ...PLATFORM_EVIDENCE[0],
    id: 'test-only-admitted-checkout',
    finding: 'supported' as const,
    claim: 'Test fixture: admission and checkout verified.',
    uncertainty: 'Test fixture only; no production claim.',
  };
  data.evidence.push(receipt);
  pro.channels.acpCheckout = {
    state: 'supported',
    evidenceIds: [receipt.id],
    reason: receipt.claim,
  };
  return { data, pro, receipt };
}

describe('commerce support matrix', () => {
  it('round-trips as versioned JSON and covers every required commerce class exactly once', () => {
    const data = matrix();
    expect(data.rows.map(row => row.commerceClass)).toEqual(COMMERCE_CLASSES);
    expect(
      validateSupportMatrix(JSON.parse(JSON.stringify(data)), now)
    ).toEqual(data);
    expect(
      data.rows.flatMap(row => CHANNELS.map(key => row.channels[key].state))
    ).not.toContain('supported');
  });

  it.each(COMMERCE_CLASSES)('requires coverage for %s', commerceClass => {
    const data = matrix();
    data.rows = data.rows.filter(row => row.commerceClass !== commerceClass);
    expect(() => validateSupportMatrix(data, now)).toThrow(
      /missing commerce class/
    );
  });

  it('projects canonical active and legacy price mappings without making legacy offers sellable', () => {
    const data = matrix();
    const pro = find(data, 'artist_visibility_pro');
    expect(pro.stripe.prices.map(price => price.priceId)).toEqual(
      Object.keys(ACTIVE_PRICE_MAPPINGS)
    );
    expect(pro.runtime.price).toMatchObject({
      amountCents: toCents(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd),
      currency: ARTIST_VISIBILITY_OFFER.pro.currency,
      interval: ARTIST_VISIBILITY_OFFER.pro.interval,
    });
    expect(find(data, 'one_time_service').runtime.price.amountCents).toBe(
      toCents(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd)
    );
    expect(find(data, 'legacy_offer').stripe.prices).toEqual(
      Object.values(PRICE_MAPPINGS)
        .filter(price => price.legacy)
        .map(price => ({
          priceId: price.priceId,
          amountCents: price.amount,
          currency: price.currency,
          interval: price.interval,
          legacy: true,
        }))
    );
    expect(find(data, 'ancillary_subscription')).toMatchObject({
      availability: 'legacy',
      webFallback: { state: 'existing_subscribers_only' },
      stripe: {
        prices: [
          {
            priceId: 'price_thumbnails_test',
            amountCents: PRICE_MAPPINGS.price_thumbnails_test.amount,
          },
        ],
      },
    });
    expect(find(data, 'disabled_usage_billing').availability).toBe(
      ARTIST_VISIBILITY_OFFER.fanSends.paidSendingEnabled
        ? 'planned'
        : 'disabled'
    );
    expect(find(data, 'enterprise_handoff').stripe.kind).toBe('none');
    expect(find(data, 'api_mcp_service').stripe.kind).toBe('none');
  });

  it('tracks missing price configuration as blocked rather than inventing an identity', () => {
    const saved = { ...ACTIVE_PRICE_MAPPINGS };
    try {
      for (const key of Object.keys(ACTIVE_PRICE_MAPPINGS))
        delete ACTIVE_PRICE_MAPPINGS[key];
      expect(find(matrix(), 'artist_visibility_pro')).toMatchObject({
        availability: 'blocked',
        stripe: { prices: [] },
      });
    } finally {
      Object.assign(ACTIVE_PRICE_MAPPINGS, saved);
    }
  });

  it('retains per-transaction guards and explicit merchant/fulfillment blockers', () => {
    const data = matrix();
    expect(find(data, 'hosted_creator_merch')).toMatchObject({
      availability: 'blocked',
      ownership: {
        merchantOfRecord: {
          state: 'blocked',
          resolutionOwner: 'jovie',
          issue: 'JOV-4077',
        },
        fulfillment: { state: 'assigned', owner: 'printful' },
      },
      runtime: {
        featureFlag: { name: 'MERCH_MVP', evaluation: 'per_request' },
        connect: {
          selector: expect.stringContaining('isStripeConnectChargesReady'),
        },
      },
      geographicLimits: expect.stringContaining('US shipping only'),
    });
    expect(find(data, 'creator_payments').channels.spt.evidenceIds).toEqual([
      'stripe-spt-connect-2026-10-15',
    ]);
    expect(find(data, 'external_store_merch')).toMatchObject({
      availability: 'handoff',
      stripe: { kind: 'none' },
      ownership: { refund: { owner: 'external_merchant' } },
    });
    // Source bindings must remain real files; no invented service or route references.
    for (const row of data.rows) {
      const bindings = [
        row.identity.source,
        row.stripe.source,
        row.runtime.price.source,
        row.runtime.featureFlag.source,
        row.runtime.connect,
        row.runtime.fulfillment,
        row.runtime.entitlement,
        row.webFallback.source,
      ];
      for (const binding of bindings)
        expect(
          existsSync(
            resolve(import.meta.dirname, '../../../../../', binding.path)
          ),
          binding.path
        ).toBe(true);
    }
  });

  it('requires every top-level, row, ownership, runtime, channel, and receipt field', () => {
    const data = matrix();
    const targets = [
      data,
      data.rows[0],
      data.rows[0].ownership,
      data.rows[0].runtime,
      data.rows[0].stripe,
      data.rows[0].channels,
      data.evidence[0],
    ];
    for (const target of targets) {
      for (const key of Object.keys(target)) {
        const record = target as unknown as Record<string, unknown>;
        const saved = record[key];
        delete record[key];
        expect(() => validateSupportMatrix(data, now), key).toThrow();
        record[key] = saved;
      }
    }
  });

  it('rejects unknown versions, duplicate rows and duplicate evidence identities', () => {
    const data = matrix();
    expect(() =>
      validateSupportMatrix(
        { ...data, version: 'jovie.commerce-support/v2' },
        now
      )
    ).toThrow();
    expect(() =>
      validateSupportMatrix(
        { ...data, rows: [...data.rows, data.rows[0]] },
        now
      )
    ).toThrow(/duplicate class/);
    expect(() =>
      validateSupportMatrix(
        { ...data, evidence: [...data.evidence, data.evidence[0]] },
        now
      )
    ).toThrow(/duplicate receipt/);
  });

  it('allows a supported claim only with fresh matching evidence, assigned owners and a sellable identity', () => {
    expect(validateSupportMatrix(admitted().data, now).rows).toHaveLength(
      COMMERCE_CLASSES.length
    );
  });

  it.each([
    'UNKNOWN',
    'partner_gated',
    'unsupported',
    'not_applicable',
  ] as const)('rejects %s evidence represented as supported', finding => {
    const { data, receipt } = admitted();
    receipt.finding = finding;
    expect(() => validateSupportMatrix(data, now)).toThrow(
      /unsupported or stale/
    );
  });

  it('rejects expired evidence, including after serializing and caching', () => {
    const { data } = admitted();
    expect(() =>
      validateSupportMatrix(
        JSON.parse(JSON.stringify(data)),
        new Date('2026-11-14T00:00:00Z')
      )
    ).toThrow(/stale/);
    // Non-support claims can remain as historical evidence after the recheck date.
    expect(
      validateSupportMatrix(matrix(), new Date('2026-11-14T00:00:00Z')).rows
    ).toHaveLength(10);
  });

  it('rejects stale repository observations even if provider evidence is refreshed', () => {
    const { data, receipt } = admitted();
    receipt.observedAt = '2026-11-15';
    receipt.recheckAt = '2026-12-15';
    expect(() =>
      validateSupportMatrix(data, new Date('2026-11-15T00:00:00Z'))
    ).toThrow(/stale repository/);
  });

  it('requires coherent observation dates and a valid clock', () => {
    const { data, receipt, pro } = admitted();
    expect(() => validateSupportMatrix(data, new Date('invalid'))).toThrow(
      /clock/
    );
    expect(() =>
      validateSupportMatrix({ ...data, sourceObservedAt: '2026-10-16' }, now)
    ).toThrow(/future source/);
    receipt.observedAt = '2026-10-16';
    expect(() => validateSupportMatrix(data, now)).toThrow(/evidence dates/);
    receipt.observedAt = '2026-10-14';
    expect(() => validateSupportMatrix(data, now)).toThrow(/stale evidence/);
    pro.evidenceObservedAt = '2026-10-16';
    expect(() => validateSupportMatrix(data, now)).toThrow(/future row/);
  });

  it.each([
    'merchantOfRecord',
    'sellerOrBeneficiary',
    'fulfillment',
    'refund',
    'support',
  ] as const)(
    'rejects ambiguous or inapplicable %s for supported sales',
    role => {
      const { data, pro } = admitted();
      pro.ownership[role] = {
        state: 'not_applicable',
        reason: 'Cannot use this to bypass ownership.',
      };
      expect(() => validateSupportMatrix(data, now)).toThrow(/ownership/);
      pro.ownership[role] = {
        state: 'blocked',
        resolutionOwner: 'jovie',
        issue: 'JOV-4077',
        reason: 'Unassigned policy.',
      };
      expect(() => validateSupportMatrix(data, now)).toThrow(/ownership/);
      expect(() =>
        validateSupportMatrix(
          {
            ...data,
            rows: [
              {
                ...pro,
                ownership: { ...pro.ownership, [role]: 'jovie or creator' },
              },
              ...data.rows.filter(row => row !== pro),
            ],
          },
          now
        )
      ).toThrow();
    }
  );

  it.each(['planned', 'disabled', 'legacy', 'handoff', 'blocked'] as const)(
    'never promotes %s availability into supported sales',
    availability => {
      const { data, pro } = admitted();
      pro.availability = availability;
      expect(() => validateSupportMatrix(data, now)).toThrow(/non-sellable/);
    }
  );

  it('keeps legacy identity excluded even if availability is relabeled', () => {
    const { data, pro } = admitted();
    pro.stripe.prices[0].legacy = true;
    expect(() => validateSupportMatrix(data, now)).toThrow(/non-sellable/);
    const legacy = find(data, 'legacy_offer');
    pro.channels.acpCheckout.state = 'partner_gated';
    legacy.availability = 'runtime_gated';
    legacy.channels.acpCheckout = {
      ...pro.channels.acpCheckout,
      state: 'supported',
    };
    expect(() => validateSupportMatrix(data, now)).toThrow(/non-sellable/);
  });

  it('rejects missing Stripe identity and receipts that are missing, mixed, or for another channel', () => {
    const { data, pro, receipt } = admitted();
    pro.stripe.prices = [];
    expect(() => validateSupportMatrix(data, now)).toThrow(/non-sellable/);
    pro.stripe.kind = 'inline_price_data';
    pro.channels.acpCheckout.evidenceIds.push(PLATFORM_EVIDENCE[0].id);
    expect(() => validateSupportMatrix(data, now)).toThrow(/unsupported/);
    pro.channels.acpCheckout.evidenceIds = ['missing'];
    expect(() => validateSupportMatrix(data, now)).toThrow(/missing receipt/);
    pro.channels.acpCheckout.evidenceIds = [receipt.id];
    receipt.channel = 'acpDiscovery';
    expect(() => validateSupportMatrix(data, now)).toThrow(/does not cover/);
  });

  it('rejects non-first-party evidence, insecure URLs, and mismatched providers', () => {
    const { data, receipt } = admitted();
    for (const url of [
      'https://example.com/policy',
      'http://developers.openai.com/policy',
      'https://user@developers.openai.com/policy',
    ]) {
      receipt.url = url;
      expect(() => validateSupportMatrix(data, now)).toThrow(/first-party/);
    }
    receipt.url = 'https://docs.stripe.com/agentic-commerce';
    receipt.provider = 'stripe';
    expect(() => validateSupportMatrix(data, now)).toThrow(/wrong provider/);
  });
});
