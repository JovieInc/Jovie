import { describe, expect, it } from 'vitest';
import {
  BILLING_SYNC_STALE_FINGERPRINT,
  BILLING_WEBHOOKS_STUCK_FINGERPRINT,
  dashboardActionForStoredEvent,
  evaluateBillingSyncRemediation,
  remediationLabel,
} from '@/lib/billing/sync-remediation-policy';

const now = new Date('2026-10-02T23:00:00.000Z');

function input(
  overrides: Partial<Parameters<typeof evaluateBillingSyncRemediation>[0]> = {}
) {
  return {
    now,
    lastReconciliationAt: new Date('2026-10-02T00:00:00.000Z'),
    stuckWebhooks: [],
    lastFiledAtByFingerprint: {
      [BILLING_SYNC_STALE_FINGERPRINT]: null,
      [BILLING_WEBHOOKS_STUCK_FINGERPRINT]: null,
    },
    ...overrides,
  };
}

describe('evaluateBillingSyncRemediation', () => {
  it('stays quiet when reconciliation is inside 48 hours and nothing is stuck', () => {
    expect(evaluateBillingSyncRemediation(input())).toEqual([]);
  });

  it('files a stale-reconciliation finding when the last run is older than 48 hours', () => {
    const findings = evaluateBillingSyncRemediation(
      input({
        lastReconciliationAt: new Date('2026-07-27T00:00:23.000Z'),
      })
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.fingerprint).toBe(BILLING_SYNC_STALE_FINGERPRINT);
    expect(findings[0]?.label).toBe(
      remediationLabel(BILLING_SYNC_STALE_FINGERPRINT)
    );
    expect(findings[0]?.title).toContain(BILLING_SYNC_STALE_FINGERPRINT);
    expect(findings[0]?.description).toContain('2026-07-27T00:00:23.000Z');
  });

  it('files when reconciliation has never been recorded', () => {
    const findings = evaluateBillingSyncRemediation(
      input({ lastReconciliationAt: null })
    );
    expect(findings.map(finding => finding.fingerprint)).toEqual([
      BILLING_SYNC_STALE_FINGERPRINT,
    ]);
  });

  it('throttles a fingerprint that was filed inside 12 hours', () => {
    const findings = evaluateBillingSyncRemediation(
      input({
        lastReconciliationAt: null,
        lastFiledAtByFingerprint: {
          [BILLING_SYNC_STALE_FINGERPRINT]: new Date(
            '2026-10-02T12:00:00.000Z'
          ),
          [BILLING_WEBHOOKS_STUCK_FINGERPRINT]: null,
        },
      })
    );
    expect(findings).toEqual([]);
  });

  it('files stuck webhooks and includes a dashboard action when one is known', () => {
    const findings = evaluateBillingSyncRemediation(
      input({
        stuckWebhooks: [
          {
            stripeEventId: 'evt_stuck',
            type: 'charge.refunded',
            createdAt: new Date('2026-10-01T00:00:00.000Z'),
            dashboardAction: 'Open subscription sub_123 and cancel it.',
          },
        ],
      })
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.fingerprint).toBe(BILLING_WEBHOOKS_STUCK_FINGERPRINT);
    expect(findings[0]?.label).toBe('remediation:billing-webhooks-stuck');
    expect(findings[0]?.description).toContain('evt_stuck');
    expect(findings[0]?.description).toContain('sub_123');
  });
});

describe('dashboardActionForStoredEvent', () => {
  it('names the subscription cancel for a refund without asking for a refund or price change', () => {
    const action = dashboardActionForStoredEvent({
      type: 'charge.refunded',
      payload: {
        data: {
          object: {
            id: 'ch_123',
            invoice: { subscription: 'sub_123' },
          },
        },
      },
    });

    expect(action).toContain('subscription sub_123');
    expect(action).toContain('charge ch_123');
    expect(action).toContain('Do not refund');
    expect(action).toContain('subscriptions.cancel');
  });

  it('reads a dispute charge id', () => {
    const action = dashboardActionForStoredEvent({
      type: 'charge.dispute.created',
      payload: {
        data: {
          object: {
            id: 'dp_123',
            charge: 'ch_456',
            invoice: { subscription: { id: 'sub_456' } },
          },
        },
      },
    });

    expect(action).toContain('subscription sub_456');
    expect(action).toContain('charge ch_456');
  });

  it('returns null for events that replay can finish locally', () => {
    expect(
      dashboardActionForStoredEvent({
        type: 'customer.subscription.updated',
        payload: { data: { object: { id: 'sub_1' } } },
      })
    ).toBeNull();
  });
});
