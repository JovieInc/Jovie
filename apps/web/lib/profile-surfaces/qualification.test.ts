import { describe, expect, it, vi } from 'vitest';
import type { DbOrTransaction } from '@/lib/db';
import { qualifyProfileSurface } from './qualification';

const SURFACE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-09-30T19:00:00.000Z');

function selectQuery(result: readonly unknown[]) {
  const query = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
    then: (
      resolve: (value: readonly unknown[]) => unknown,
      reject: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  };
  query.from.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  query.leftJoin.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  return query;
}

describe('qualifyProfileSurface', () => {
  it('retains source provenance when the owner rejects an identity', async () => {
    const surfaceQuery = selectQuery([
      {
        id: SURFACE_ID,
        creatorProfileId: PROFILE_ID,
        platform: 'seven_digital',
        normalizedUrl: 'https://www.7digital.com/artist/tim-white',
        externalId: 'tim-white',
        qualificationStatus: 'suggested',
        identityConfidence: '0.61',
        lastDiscoveredAt: new Date('2026-09-30T17:00:00.000Z'),
      },
    ]);
    const select = vi
      .fn()
      .mockReturnValueOnce(surfaceQuery)
      .mockReturnValueOnce(selectQuery([]))
      .mockReturnValueOnce(
        selectQuery([
          {
            sourceType: 'identity_link',
            sourceRefId: `${PROFILE_ID}:seven_digital`,
            sourceUrl: 'https://www.7digital.com/artist/tim-white',
            externalId: 'tim-white',
            firstSeenAt: new Date('2026-09-29T00:00:00.000Z'),
            lastSeenAt: new Date('2026-09-30T18:00:00.000Z'),
          },
        ])
      );
    const updateValues = vi.fn();
    const returning = vi.fn().mockResolvedValue([{ id: SURFACE_ID }]);
    const updateWhere = vi.fn().mockReturnValue({ returning });
    updateValues.mockReturnValue({ where: updateWhere });
    const evidenceValues = vi.fn().mockResolvedValue(undefined);
    const tx = {
      select,
      update: vi.fn().mockReturnValue({ set: updateValues }),
      insert: vi.fn().mockReturnValue({ values: evidenceValues }),
    } as unknown as DbOrTransaction;

    const result = await qualifyProfileSurface(tx, {
      surfaceId: SURFACE_ID,
      actorUserId: USER_ID,
      decision: 'no',
      now: NOW,
    });

    expect(result).toEqual({ ok: true, changed: true, status: 'rejected' });
    expect(surfaceQuery.leftJoin).toHaveBeenCalledOnce();
    expect(updateValues).toHaveBeenCalledWith(
      expect.objectContaining({
        qualificationStatus: 'rejected',
        identityConfidence: '0.00',
        isOfficial: false,
        lastVerifiedAt: NOW,
      })
    );
    expect(evidenceValues).toHaveBeenCalledWith(
      expect.objectContaining({
        surfaceId: SURFACE_ID,
        previousStatus: 'suggested',
        nextStatus: 'rejected',
        actorType: 'profile_owner',
        actorId: USER_ID,
        reason: 'owner_rejected_identity',
        evidence: {
          schema: 'presence-identity-confirmation/v1',
          decision: 'no',
          observedAt: NOW.toISOString(),
          surface: {
            platform: 'seven_digital',
            normalizedUrl: 'https://www.7digital.com/artist/tim-white',
            externalId: 'tim-white',
            candidateConfidence: 0.61,
            lastDiscoveredAt: '2026-09-30T17:00:00.000Z',
          },
          sourceClaims: [
            expect.objectContaining({
              sourceType: 'identity_link',
              firstSeenAt: '2026-09-29T00:00:00.000Z',
              lastSeenAt: '2026-09-30T18:00:00.000Z',
            }),
          ],
        },
      })
    );
  });
});
