import { describe, expect, it } from 'vitest';
import { reconcilePaidAcquisition } from './reconciliation';

const paidAt = '2026-09-20T00:00:00.000Z';
const asOf = '2026-09-27T00:00:00.000Z';

describe('reconcilePaidAcquisition', () => {
  it('prefers exact correlation, deduplicates retries, and computes net facts', () => {
    const order = {
      logicalOrderId: 'in_1',
      userId: 'u1',
      grossAmountCents: 1000,
      refundedAmountCents: 200,
      disputedAmountCents: 100,
      currency: 'usd',
      paidAt,
      acquisitionId: 'a1',
    };
    const result = reconcilePaidAcquisition(
      [order, order],
      [
        {
          acquisitionId: 'a1',
          userId: 'u1',
          capturedAt: '2026-09-01T00:00:00.000Z',
          firstTouch: { campaign: 'launch' },
        },
      ],
      asOf
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      matchingMethod: 'exact_order_correlation',
      confidence: 'exact',
      netAmountCents: 700,
      causalClaim: false,
    });
  });

  it('uses only an authorized linked identity when exact correlation is absent', () => {
    const [result] = reconcilePaidAcquisition(
      [
        {
          logicalOrderId: 'in_2',
          userId: 'u2',
          grossAmountCents: 500,
          currency: 'usd',
          paidAt,
        },
      ],
      [
        {
          acquisitionId: 'a2',
          userId: 'u2',
          capturedAt: '2026-09-10T00:00:00.000Z',
          firstTouch: { source: 'organic' },
        },
      ],
      asOf
    );
    expect(result.matchingMethod).toBe('linked_authorized_identity');
  });

  it.each([
    ['missing history', []],
    [
      'revoked consent',
      [
        {
          acquisitionId: 'a3',
          userId: 'u3',
          capturedAt: '2026-09-10T00:00:00.000Z',
          consentRevokedAt: '2026-09-11T00:00:00.000Z',
          firstTouch: { source: 'ad' },
        },
      ],
    ],
    [
      'cross-tenant identity',
      [
        {
          acquisitionId: 'a3',
          userId: 'other',
          capturedAt: '2026-09-10T00:00:00.000Z',
          firstTouch: { source: 'ad' },
        },
      ],
    ],
  ])(
    'keeps successful payment under unknown for %s',
    (_label, acquisitions) => {
      const [result] = reconcilePaidAcquisition(
        [
          {
            logicalOrderId: 'in_3',
            userId: 'u3',
            grossAmountCents: 500,
            currency: 'usd',
            paidAt,
            acquisitionId: 'a3',
          },
        ],
        acquisitions,
        asOf
      );
      expect(result).toMatchObject({
        source: 'unknown',
        matchingMethod: 'unmatched',
        grossAmountCents: 500,
      });
    }
  );
});
