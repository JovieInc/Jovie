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
  it('keeps a fresh failed canonical run actionable', () => {
    expect(
      evaluateBillingSyncRemediation(
        input({ lastReconciliationSuccess: false })
      )
    ).toEqual([
      expect.objectContaining({ fingerprint: BILLING_SYNC_STALE_FINGERPRINT }),
    ]);
  });

  it('stays quiet inside 48 hours and throttles a recent filing', () => {
    expect(evaluateBillingSyncRemediation(input())).toEqual([]);
    expect(
      evaluateBillingSyncRemediation(
        input({
          lastReconciliationAt: null,
          lastFiledAtByFingerprint: {
            [BILLING_SYNC_STALE_FINGERPRINT]: new Date(
              '2026-10-02T12:00:00.000Z'
            ),
            [BILLING_WEBHOOKS_STUCK_FINGERPRINT]: null,
          },
        })
      )
    ).toEqual([]);
  });
  it('files a stale run and a never-recorded run', () => {
    const stale = evaluateBillingSyncRemediation(
      input({ lastReconciliationAt: new Date('2026-07-27T00:00:23.000Z') })
    );
    expect(stale[0]?.label).toBe(
      remediationLabel(BILLING_SYNC_STALE_FINGERPRINT)
    );
    expect(stale[0]?.title).toContain(BILLING_SYNC_STALE_FINGERPRINT);
    expect(stale[0]?.description).toContain('2026-07-27T00:00:23.000Z');
    expect(
      evaluateBillingSyncRemediation(input({ lastReconciliationAt: null })).map(
        finding => finding.fingerprint
      )
    ).toEqual([BILLING_SYNC_STALE_FINGERPRINT]);
  });
  it('includes the dashboard action on stuck refunds', () => {
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
    expect(findings[0]?.fingerprint).toBe(BILLING_WEBHOOKS_STUCK_FINGERPRINT);
    expect(findings[0]?.description).toContain('evt_stuck');
    expect(findings[0]?.description).toContain('sub_123');
    expect(findings[0]?.description).toContain('Do not refund');
  });
});
describe('dashboardActionForStoredEvent', () => {
  it('names the cancel and forbids refunds, charges, and price changes', () => {
    const action = dashboardActionForStoredEvent({
      type: 'charge.refunded',
      payload: {
        data: {
          object: { id: 'ch_123', invoice: { subscription: 'sub_123' } },
        },
      },
    });
    expect(action).toContain('subscription sub_123');
    expect(action).toContain('charge ch_123');
    expect(action).toContain('Do not refund');
    const dispute = dashboardActionForStoredEvent({
      type: 'charge.dispute.created',
      payload: {
        data: {
          object: {
            charge: 'ch_456',
            invoice: { subscription: { id: 'sub_456' } },
          },
        },
      },
    });
    expect(dispute).toContain('subscription sub_456');
    expect(dispute).toContain('charge ch_456');
    expect(
      dashboardActionForStoredEvent({
        type: 'customer.subscription.updated',
        payload: { data: { object: { id: 'sub_1' } } },
      })
    ).toBeNull();
  });
});
