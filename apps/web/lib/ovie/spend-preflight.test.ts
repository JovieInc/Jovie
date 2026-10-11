import { describe, expect, it } from 'vitest';
import {
  evaluateSpendIntent,
  spendIntentRequestSchema,
} from './spend-preflight';

const TERMS = 'https://musicfetch.io/terms';
const CC0 = 'https://musicbrainz.org/doc/About/Data_License';
const ISSUE = 'https://linear.app/jovie/issue/JOV-7320/music-resolver';

function route(kind: 'owned' | 'free' | 'build' | 'paid', overrides = {}) {
  const paid = kind === 'paid';
  return {
    id: kind,
    kind,
    vendor: paid ? 'Musicfetch' : 'Jovie',
    vendorProduct: paid
      ? 'Starter trial'
      : kind === 'build'
        ? 'cache + CC0 core dump'
        : `${kind} resolver path`,
    available: true,
    coversOutcome: false,
    reason: 'Checked for the retained parity corpus.',
    terms: {
      status: paid ? 'incompatible' : 'compatible',
      summary: paid
        ? 'Terms prohibit a competing music-data or link-matching service.'
        : 'Internal data or MusicBrainz CC0 core data permits retention.',
      sourceRef: paid ? TERMS : CC0,
      checkedAt: '2026-09-30T21:00:00.000Z',
    },
    requestedChargeUsd: 0,
    hardMaximumExposureUsd: paid ? 50 : 0,
    fullyLoadedCostUsd: null,
    costValueReceiptRef: null,
    timeToAnswerMinutes: 60,
    autoRenews: paid,
    overagePossible: paid,
    renewalBehavior: paid ? '$50/month after seven days' : 'None',
    overageBehavior: paid ? 'Metered overage' : 'None',
    cancellationPath: paid ? 'Cancel in the account page' : 'Stop the job',
    paymentCredentialAction: paid ? 'founder-details-required' : 'none',
    ...overrides,
  };
}

function request(overrides = {}) {
  return spendIntentRequestSchema.parse({
    kind: 'spend-intent',
    idempotencyKey: 'musicfetch-jov-7320',
    product: 'jov',
    issue: 'JOV-7320',
    issueUrl: ISSUE,
    outcome:
      'Retained provider, identifier, territory, latency, cost, and failure parity.',
    expectedDurableOutcome:
      'A provenance-backed corpus and exact parity receipts.',
    stopCondition:
      'Stop after representative seeds produce adjudicable receipts.',
    owner: 'Music Resolver',
    decidedAt: '2026-09-30T22:00:00.000Z',
    ownedCapacitySearch: {
      inventoryRef: ISSUE,
      checkedAt: '2026-09-30T21:30:00.000Z',
      checked: [
        'included-seats-agents',
        'credits',
        'free-quotas',
        'cached-internal-data',
        'authorized-accounts',
      ],
      summary: 'Existing cache helps but is not a representative corpus.',
    },
    alternatives: [
      route('owned'),
      route('free'),
      route('build'),
      route('paid'),
    ],
    preAuthorizedEnvelope: null,
    ...overrides,
  });
}

describe('spend preflight', () => {
  it('resolves the Musicfetch canary without spend when terms block comparison use', () => {
    const result = evaluateSpendIntent(
      request({
        alternatives: [
          route('owned'),
          route('free'),
          route('build', { coversOutcome: true }),
          route('paid'),
        ],
      })
    );
    expect(result).toMatchObject({
      disposition: 'use-valid-alternative',
      selectedRoute: { kind: 'build' },
      approvalCard: null,
    });
  });

  it('emits one bounded card for a paid route outside delegated authority', () => {
    const paid = route('paid', {
      coversOutcome: true,
      terms: { ...route('paid').terms, status: 'compatible' },
      fullyLoadedCostUsd: 50,
      costValueReceiptRef: ISSUE,
    });
    const alternatives = [route('owned'), route('free'), route('build'), paid];
    const approval = evaluateSpendIntent(request({ alternatives }));
    expect(approval.approvalCard).toMatchObject({
      amountUsd: 50,
      preflightReceiptId: approval.id,
    });
  });
});
