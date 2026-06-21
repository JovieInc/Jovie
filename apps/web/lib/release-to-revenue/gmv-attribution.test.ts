import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockResolveMerchCardIdsForRun = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());

vi.mock('./store-listing', () => ({
  resolveMerchCardIdsForRun: mockResolveMerchCardIdsForRun,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

import {
  buildReleaseGmvRowForRun,
  computeStoreGmvCents,
  isReleaseGmvCountableStatus,
} from './gmv-attribution';

describe('release-to-revenue GMV attribution', () => {
  it('counts only paid Printful-backed order subtotals toward GMV', () => {
    const result = computeStoreGmvCents([
      { subtotalCents: 2500, status: 'paid' },
      { subtotalCents: 3000, status: 'shipped' },
      { subtotalCents: 9999, status: 'checkout_created' },
      { subtotalCents: 1200, status: 'refunded' },
    ]);

    expect(result).toEqual({ gmvCents: 5500, orderCount: 2 });
  });

  it('treats fulfillment pipeline statuses as countable GMV', () => {
    expect(isReleaseGmvCountableStatus('submitted_to_printful')).toBe(true);
    expect(isReleaseGmvCountableStatus('fulfilling')).toBe(true);
    expect(isReleaseGmvCountableStatus('checkout_created')).toBe(false);
    expect(isReleaseGmvCountableStatus('cancelled')).toBe(false);
  });

  it('returns zero GMV when no orders qualify', () => {
    expect(
      computeStoreGmvCents([
        { subtotalCents: 4000, status: 'checkout_created' },
        { subtotalCents: 1500, status: 'failed' },
      ])
    ).toEqual({ gmvCents: 0, orderCount: 0 });
  });
});

describe('buildReleaseGmvRowForRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rolls up paid orders from a release store listing to the autopilot run', async () => {
    mockResolveMerchCardIdsForRun.mockResolvedValue(['card-1', 'card-2']);
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            id: 'order-1',
            merchCardId: 'card-1',
            subtotalCents: 3200,
            status: 'paid',
          },
          {
            id: 'order-2',
            merchCardId: 'card-2',
            subtotalCents: 1800,
            status: 'shipped',
          },
          {
            id: 'order-3',
            merchCardId: 'card-2',
            subtotalCents: 5000,
            status: 'checkout_created',
          },
        ]),
      }),
    });

    const row = await buildReleaseGmvRowForRun({
      workflowRunId: 'run-1',
      stepOutputs: {
        releaseId: 'release-1',
        triggerSource: 'catalog',
        triggeredAt: '2026-06-19T00:00:00.000Z',
        designPartner: {
          creatorUsername: 'tim',
          creatorProfileId: 'profile-1',
          userId: 'user-1',
          store: { provider: 'printful', scope: 'default' },
          socialAccount: { platform: 'instagram', handle: 'tim' },
          smsListId: 'sms-1',
        },
        release: {
          title: 'Night Drive',
          artworkUrl: null,
          links: [],
        },
        storeListing: { merchCardIds: ['card-1', 'card-2'] },
      },
    });

    expect(row).toMatchObject({
      workflowRunId: 'run-1',
      releaseId: 'release-1',
      releaseTitle: 'Night Drive',
      merchCardIds: ['card-1', 'card-2'],
      orderCount: 2,
      gmvCents: 5000,
    });
  });
});
