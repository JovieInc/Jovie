import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
  getPlanSignupHref,
} from '../offer-truth';
import {
  ACCESS_RECEIPT_VERSION,
  type ProviderAccessReceipt,
} from './provider-access';
import { compileRailDecisions } from './rail-decisions';

const NOW = new Date('2026-10-15T18:00:00Z');
const accounts = { openai: 'openai-jovie', stripe: 'stripe-jovie' };
const price = {
  priceId: 'price_current_pro',
  amountCents: 19900,
  currency: 'usd',
  interval: 'month' as const,
  legacy: false,
};
function matrix() {
  const owner = { state: 'assigned', owner: 'jovie' };
  const channel = { state: 'UNKNOWN' };
  return {
    version: 'jovie.commerce-support/v1',
    sourceObservedAt: '2026-10-15',
    rows: [
      {
        commerceClass: 'artist_visibility_pro',
        evidenceObservedAt: '2026-10-15',
        identity: { id: ARTIST_VISIBILITY_OFFER_CONTRACT_ID as string },
        offerType: 'subscription',
        ownership: {
          merchantOfRecord: owner,
          sellerOrBeneficiary: owner,
          fulfillment: owner,
          refund: owner,
          support: owner,
        },
        stripe: { kind: 'configured_prices', prices: [{ ...price }] },
        channels: {
          acpCheckout: channel,
          acpDiscovery: channel,
          chatgptPlugin: channel,
          spt: channel,
          stripeDistribution: channel,
        },
        runtime: {
          price: { amountCents: 19900, currency: 'usd', interval: 'month' },
          featureFlag: { evaluation: 'not_applicable' },
        },
        webFallback: { state: 'runtime_gated' },
        availability: 'runtime_gated',
        requirements: {
          claim: ['Human account/claim required'],
          approval: ['Explicit buyer approval'],
        },
        reEvaluationTrigger: 'Price, access or policy change',
      },
    ],
  };
}
function receipt(
  overrides: Partial<ProviderAccessReceipt> = {}
): ProviderAccessReceipt {
  return {
    provider: 'stripe',
    account: accounts.stripe,
    capability: 'ordinary-web-checkout',
    resource: null,
    environment: 'live',
    observedAt: '2026-10-15T17:00:00Z',
    expiresAt: '2026-10-16T17:00:00Z',
    result: 'GRANTED',
    source: 'account-api',
    verification: 'verified',
    evidenceRef: 'private:observation',
    sku: null,
    ...overrides,
  };
}
function receipts() {
  return [
    receipt(),
    receipt({
      capability: 'active-sku',
      resource: price.priceId,
      sku: {
        priceId: price.priceId,
        amountCents: price.amountCents,
        currency: price.currency,
        interval: price.interval,
        active: true,
        productActive: true,
      },
    }),
  ];
}
function evidence(input = receipts()) {
  return { version: ACCESS_RECEIPT_VERSION, receipts: input };
}
function compile(input = matrix(), proof: unknown = evidence()) {
  return compileRailDecisions(input, proof, accounts, NOW);
}
function first(input = matrix(), proof: unknown = evidence()) {
  return compile(input, proof).decisions[0];
}

describe('fail-closed rail selection', () => {
  it('selects exactly canonical $199 monthly web checkout with human claim/approval and Jovie as merchant', () => {
    expect(first()).toMatchObject({
      status: 'supported',
      rail: 'ordinary-web-checkout',
      price: {
        priceId: price.priceId,
        amountCents: 19900,
        currency: 'usd',
        interval: 'month',
      },
      merchantOfRecord: { state: 'assigned', owner: 'jovie' },
      handoff: {
        href: getPlanSignupHref('pro', 'month'),
        humanAccountOrClaimRequired: true,
        buyerApprovalRequired: true,
      },
      blockers: [],
    });
    const decision = first();
    for (const key of [
      'shipNow',
      'reEvaluateWhen',
      'then',
      'reversibility',
      'evidenceRevision',
      'matrixRevision',
      'policyRevision',
    ] as const) {
      expect(decision[key].length).toBeGreaterThan(0);
    }
    expect(decision.rejectedAlternatives).toHaveLength(6);
    expect(decision.evidenceRevision).toBe(compile().evidenceRevision);
  });

  it('rejects plugin subscriptions and every uncertified agent rail even with account grants and claimed matrix support', () => {
    const input = matrix();
    for (const key of Object.keys(input.rows[0].channels) as Array<
      keyof (typeof input.rows)[0]['channels']
    >) {
      input.rows[0].channels[key] = { state: 'supported' };
    }
    const grants: ProviderAccessReceipt[] = [
      'acs',
      'mpp',
      'projects',
      'spt',
    ].map(capability =>
      receipt({ capability: capability as ProviderAccessReceipt['capability'] })
    );
    grants.push(
      receipt({
        provider: 'openai',
        account: accounts.openai,
        capability: 'acp',
      })
    );
    grants.push(
      receipt({
        provider: 'openai',
        account: accounts.openai,
        capability: 'plugin-subscription-checkout',
      })
    );
    const decision = first(input, evidence([...receipts(), ...grants]));
    expect(decision.rail).toBe('ordinary-web-checkout');
    expect(
      decision.rejectedAlternatives.map(alternative => alternative.rail)
    ).toEqual([
      'acp',
      'acs',
      'mpp',
      'plugin-subscription-checkout',
      'projects',
      'spt',
    ]);
    expect(
      decision.rejectedAlternatives.every(
        alternative => alternative.access === 'GRANTED'
      )
    ).toBe(true);
    expect(
      decision.rejectedAlternatives.find(
        alternative => alternative.rail === 'plugin-subscription-checkout'
      )?.reasons
    ).toContain('unsupported-plugin-subscription-checkout');
    expect(first(input, evidence(grants))).toMatchObject({
      status: 'blocked',
      rail: null,
    });
  });

  it('emits one explicit result per matrix class including unsellable/handoff/legacy offers', () => {
    const input = matrix();
    const classes = [
      'ancillary_subscription',
      'api_mcp_service',
      'creator_payments',
      'disabled_usage_billing',
      'enterprise_handoff',
      'external_store_merch',
      'hosted_creator_merch',
      'legacy_offer',
      'one_time_service',
    ];
    for (const commerceClass of classes) {
      const row = structuredClone(input.rows[0]);
      row.commerceClass = commerceClass;
      row.stripe = { kind: 'none', prices: [] };
      row.availability =
        commerceClass === 'legacy_offer' ? 'legacy' : 'blocked';
      input.rows.push(row);
    }
    const result = compile(input);
    expect(result.decisions).toHaveLength(10);
    expect(
      new Set(result.decisions.map(decision => decision.commerceClass)).size
    ).toBe(10);
    expect(result.decisions.filter(decision => decision.rail)).toHaveLength(1);
    for (const decision of result.decisions.filter(
      decision => decision.commerceClass !== 'artist_visibility_pro'
    )) {
      expect(decision).toMatchObject({
        status: 'blocked',
        rail: null,
        price: null,
        handoff: null,
      });
      expect(decision.blockers).toContain('active-canonical-sku-unverified');
    }
    expect(compile({ ...input, rows: [...input.rows].reverse() })).toEqual(
      result
    );
  });

  it.each([
    [
      'availability',
      (input: ReturnType<typeof matrix>) => {
        input.rows[0].availability = 'disabled';
      },
    ],
    [
      'owner',
      (input: ReturnType<typeof matrix>) => {
        input.rows[0].ownership.refund = { state: 'blocked', owner: 'jovie' };
      },
    ],
    [
      'merchant',
      (input: ReturnType<typeof matrix>) => {
        input.rows[0].ownership.merchantOfRecord = {
          state: 'assigned',
          owner: 'creator',
        };
      },
    ],
    [
      'fallback',
      (input: ReturnType<typeof matrix>) => {
        input.rows[0].webFallback.state = 'handoff';
      },
    ],
    [
      'flag',
      (input: ReturnType<typeof matrix>) => {
        input.rows[0].runtime.featureFlag.evaluation = 'per_request';
      },
    ],
    [
      'identity',
      (input: ReturnType<typeof matrix>) => {
        input.rows[0].identity.id = 'other-offer';
      },
    ],
    [
      'price',
      (input: ReturnType<typeof matrix>) => {
        input.rows[0].runtime.price.amountCents = 3900;
      },
    ],
    [
      'currency',
      (input: ReturnType<typeof matrix>) => {
        input.rows[0].runtime.price.currency = 'eur';
      },
    ],
    [
      'interval',
      (input: ReturnType<typeof matrix>) => {
        input.rows[0].runtime.price.interval = 'year';
      },
    ],
    [
      'missing sku',
      (input: ReturnType<typeof matrix>) => {
        input.rows[0].stripe.prices = [];
      },
    ],
    [
      'legacy sku',
      (input: ReturnType<typeof matrix>) => {
        input.rows[0].stripe.prices[0].legacy = true;
      },
    ],
    [
      'unbound sku',
      (input: ReturnType<typeof matrix>) => {
        input.rows[0].stripe.kind = 'payment_link';
      },
    ],
    [
      'old source',
      (input: ReturnType<typeof matrix>) => {
        input.sourceObservedAt = '2026-09-01';
      },
    ],
    [
      'future source',
      (input: ReturnType<typeof matrix>) => {
        input.sourceObservedAt = '2026-10-16';
      },
    ],
  ])('blocks a sale with %s evidence', (_label, mutate) => {
    const input = matrix();
    mutate(input);
    expect(first(input)).toMatchObject({ status: 'blocked', rail: null });
  });

  it.each([
    { active: false },
    { productActive: false },
    { amountCents: 3900 },
    { currency: 'eur' },
    { interval: 'year' as const },
    { priceId: 'price_other' },
  ])(
    'requires account-bound live price/product evidence matching the canonical SKU: %j',
    changed => {
      const proof = receipts();
      proof[1].sku = { ...proof[1].sku!, ...changed };
      expect(first(matrix(), evidence(proof)).blockers).toContain(
        'active-canonical-sku-unverified'
      );
    }
  );

  it('blocks without access, with denied checkout, test-mode SKU or another merchant account', () => {
    expect(first(matrix(), null)).toMatchObject({
      status: 'blocked',
      rail: null,
      providerAccess: { checkout: { result: 'UNKNOWN' } },
    });
    const denied = receipts();
    denied[0].result = 'DENIED';
    expect(first(matrix(), evidence(denied)).blockers).toContain(
      'web-access-DENIED'
    );
    const testMode = receipts();
    testMode[1].environment = 'test';
    expect(first(matrix(), evidence(testMode)).rail).toBeNull();
    expect(
      compileRailDecisions(
        matrix(),
        evidence(),
        { openai: null, stripe: 'different-account' },
        NOW
      ).decisions[0].rail
    ).toBeNull();
    expect(
      compileRailDecisions(
        matrix(),
        evidence(),
        { openai: null, stripe: null },
        NOW
      ).decisions[0].rail
    ).toBeNull();
  });

  it('has deterministic import order and evidence revisions that change with revoked access', () => {
    expect(compile(matrix(), evidence([...receipts()].reverse()))).toEqual(
      compile()
    );
    const denied = receipts();
    denied[0].result = 'DENIED';
    expect(compile(matrix(), evidence(denied)).evidenceRevision).not.toBe(
      compile().evidenceRevision
    );
    expect(
      compileRailDecisions(
        matrix(),
        evidence(),
        accounts,
        new Date('2026-10-16T18:00:00Z')
      ).decisions[0].rail
    ).toBeNull();
  });

  it('chooses a stable active price when configuration contains equivalent SKUs', () => {
    const input = matrix();
    const alternative = { ...price, priceId: 'price_alternative' };
    input.rows[0].stripe.prices.push(alternative);
    const proof = receipts();
    proof.push(
      receipt({
        capability: 'active-sku',
        resource: alternative.priceId,
        sku: {
          priceId: alternative.priceId,
          amountCents: 19900,
          currency: 'usd',
          interval: 'month',
          active: true,
          productActive: true,
        },
      })
    );
    expect(first(input, evidence(proof)).price?.priceId).toBe(
      alternative.priceId
    );
    input.rows[0].stripe.prices.reverse();
    expect(first(input, evidence(proof)).price?.priceId).toBe(
      alternative.priceId
    );
  });

  it('rejects malformed/duplicate rows and invalid clocks rather than silently omitting them', () => {
    const duplicate = matrix();
    duplicate.rows.push(structuredClone(duplicate.rows[0]));
    expect(() => compile(duplicate)).toThrow('Duplicate commerce class');
    expect(() => compileRailDecisions({}, null, accounts, NOW)).toThrow();
    expect(() =>
      compileRailDecisions(matrix(), null, accounts, new Date('invalid'))
    ).toThrow('Invalid decision clock');
  });

  it('blocks stale row evidence and inconsistent Pro ownership', () => {
    const input = matrix();
    input.rows[0].evidenceObservedAt = '2026-09-01';
    expect(first(input).rail).toBeNull();
    input.rows[0].evidenceObservedAt = '2026-10-16';
    expect(first(input).rail).toBeNull();
    const wrongOwner = matrix();
    wrongOwner.rows[0].ownership.fulfillment = {
      state: 'assigned',
      owner: 'printful',
    };
    expect(first(wrongOwner).rail).toBeNull();
  });

  it('compiles importable files through the real CLI and fails closed on missing evidence files', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'jov-8215-'));
    try {
      for (const [name, value] of Object.entries({
        matrix: matrix(),
        access: evidence(),
        accounts,
      })) {
        writeFileSync(resolve(dir, `${name}.json`), JSON.stringify(value));
      }
      const args = [
        '--import',
        'tsx',
        resolve('scripts/commerce-rail-decisions.ts'),
        '--matrix',
        resolve(dir, 'matrix.json'),
        '--accounts',
        resolve(dir, 'accounts.json'),
        '--at',
        NOW.toISOString(),
      ];
      const run = (path: string) =>
        spawnSync(process.execPath, [...args, '--access', path], {
          encoding: 'utf8',
          env: { ...process.env, TSX_TSCONFIG_PATH: resolve('tsconfig.json') },
        });
      const supported = run(resolve(dir, 'access.json'));
      expect(supported.error).toBeUndefined();
      expect(supported.stderr).toBe('');
      expect(supported.status).toBe(0);
      expect(JSON.parse(supported.stdout).decisions[0]).toMatchObject({
        status: 'supported',
        rail: 'ordinary-web-checkout',
      });
      const missing = run(resolve(dir, 'missing.json'));
      expect(missing.status).toBe(0);
      expect(JSON.parse(missing.stdout).decisions[0]).toMatchObject({
        status: 'blocked',
        rail: null,
        providerAccess: { checkout: { result: 'UNKNOWN' } },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
