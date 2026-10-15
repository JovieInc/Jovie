import { expect, it, vi } from 'vitest';

const execute = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({ db: { execute } }));

import { getPaidAcquisitionEvidence } from './reconciliation.server';

it('reconciles stored paid correlation and agent source without upgrading passive identity scope', async () => {
  const source = {
    source: 'agent-handoff',
    agentIntent: {
      id: 'f3d8b4dc-e451-4af4-8cd3-5a64b27530a9',
      channel: 'agent-handoff',
      offer: 'artist-visibility-offer-contract-v1',
      rail: 'ordinary-web-checkout',
      decisionRevision: 'decision-r4',
      matrixRevision: 'matrix-r7',
      expiresAt: Date.parse('2026-10-15T19:00:00Z'),
    },
  };
  execute
    .mockResolvedValueOnce({
      rows: [
        {
          logical_order_id: 'invoice-1',
          user_id: 'user-1',
          gross_amount_cents: 19900,
          currency: 'usd',
          paid_at: '2026-10-15T18:30:00Z',
          acquisition_id: 'acquisition-1',
          refunded_amount_cents: 0,
          disputed_amount_cents: 0,
        },
      ],
    })
    .mockResolvedValueOnce({
      rows: [
        {
          acquisition_id: 'acquisition-1',
          user_id: 'user-1',
          captured_at: '2026-10-15T18:00:00Z',
          consent_revoked_at: null,
          first_touch: source,
          identity_scope: 'pre_auth_first_party_cookie',
        },
      ],
    });
  const [receipt] = await getPaidAcquisitionEvidence(
    new Date('2026-10-15T20:00:00Z')
  );
  expect(receipt).toMatchObject({
    acquisitionId: 'acquisition-1',
    source,
    confidence: 'exact',
    matchingMethod: 'exact_order_correlation',
    identityScope: 'pre_auth_first_party_cookie',
    netAmountCents: 19900,
    causalClaim: false,
  });
});
