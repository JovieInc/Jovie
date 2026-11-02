// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stamp = vi.hoisted(() => vi.fn());
const stage = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: { execute: vi.fn() } }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/waitlist/approval', () => ({
  stampWaitlistAcquisitionId: stamp,
}));
vi.mock(
  '@/lib/acquisition/artist-offer-funnel.server',
  async importOriginal => ({
    ...(await importOriginal<
      typeof import('@/lib/acquisition/artist-offer-funnel.server')
    >()),
    recordArtistOfferStage: stage,
  })
);

import {
  acquisitionIdFromCookieHeader,
  recordWaitlistJoin,
} from '@/lib/waitlist/acquisition-stages';

const ID = '7f5bb735-8e88-4d78-ae32-5228cc12a8bb';

describe('acquisitionIdFromCookieHeader', () => {
  it('returns null for a malformed percent escape instead of throwing', () => {
    expect(() =>
      acquisitionIdFromCookieHeader('jv_acquisition_id=%E0%A4%A')
    ).not.toThrow();
    expect(
      acquisitionIdFromCookieHeader('jv_acquisition_id=%E0%A4%A')
    ).toBeNull();
  });

  it('still reads a valid id next to a malformed cookie', () => {
    expect(
      acquisitionIdFromCookieHeader(`x=%E0%A4%A; jv_acquisition_id=${ID}`)
    ).toBe(ID);
  });
});

describe('recordWaitlistJoin ownership gate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes the session user to the stamp', async () => {
    stamp.mockResolvedValue(true);
    await recordWaitlistJoin({
      entryId: 'e1',
      acquisitionId: ID,
      admitted: true,
      appUserId: 'u1',
    });
    expect(stamp).toHaveBeenCalledWith('e1', ID, 'u1');
    expect(stage).toHaveBeenCalledWith(ID, 'waitlist-join');
    expect(stage).toHaveBeenCalledWith(ID, 'admitted');
  });

  it('records no stage when the journey belongs to someone else or is revoked', async () => {
    stamp.mockResolvedValue(false);
    await recordWaitlistJoin({
      entryId: 'e1',
      acquisitionId: ID,
      admitted: true,
      appUserId: 'u1',
    });
    expect(stage).not.toHaveBeenCalled();
  });
});
