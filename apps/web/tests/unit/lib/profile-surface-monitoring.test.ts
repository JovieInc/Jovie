import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: { execute: executeMock },
}));

import { swapProfileSurfaceMonitoring } from '@/lib/db/profile-surface-monitoring';

const INPUT = {
  userId: '11111111-1111-4111-8111-111111111111',
  creatorProfileId: '22222222-2222-4222-8222-222222222222',
  activateSurfaceId: '33333333-3333-4333-8333-333333333333',
  pauseSurfaceId: '44444444-4444-4444-8444-444444444444',
  limit: 5,
} as const;

describe('swapProfileSurfaceMonitoring', () => {
  beforeEach(() => {
    executeMock.mockReset();
  });

  it('returns true only when the atomic statement activates a row', async () => {
    executeMock.mockResolvedValueOnce({ rows: [{ surface_id: 'surface' }] });
    await expect(swapProfileSurfaceMonitoring(INPUT)).resolves.toBe(true);

    executeMock.mockResolvedValueOnce({ rows: [] });
    await expect(swapProfileSurfaceMonitoring(INPUT)).resolves.toBe(false);
  });

  it('rejects a zero limit without touching the database', async () => {
    await expect(
      swapProfileSurfaceMonitoring({ ...INPUT, limit: 0 })
    ).resolves.toBe(false);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('supports unlimited plans through the same serialized statement', async () => {
    executeMock.mockResolvedValueOnce({ rows: [{ surface_id: 'surface' }] });
    await expect(
      swapProfileSurfaceMonitoring({ ...INPUT, limit: null })
    ).resolves.toBe(true);
    expect(executeMock).toHaveBeenCalledOnce();
  });
});
