import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings: [...strings],
    values,
  })),
}));

vi.mock('@/lib/db', () => ({
  db: { execute: mocks.execute },
}));

vi.mock('drizzle-orm', () => ({
  sql: mocks.sql,
}));

import { claimAndEnqueueCustomerRecovery } from '@/lib/db/customer-recovery';

describe('claimAndEnqueueCustomerRecovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the atomically inserted recovery job id', async () => {
    mocks.execute.mockResolvedValue({ rows: [{ id: 'job-1' }] });

    await expect(
      claimAndEnqueueCustomerRecovery({
        creatorProfileId: '11111111-1111-4111-8111-111111111111',
        spotifyUrl: 'https://open.spotify.com/artist/artist-1',
      })
    ).resolves.toBe('job-1');

    const query = mocks.execute.mock.calls[0]?.[0] as { values: unknown[] };
    const payloadJson = query.values.find(
      value => typeof value === 'string' && value.startsWith('{')
    );
    expect(JSON.parse(String(payloadJson))).toMatchObject({
      creatorProfileId: '11111111-1111-4111-8111-111111111111',
      recoveryClaimed: true,
    });
  });

  it('returns null when another request already claimed the profile', async () => {
    mocks.execute.mockResolvedValue({ rows: [] });

    await expect(
      claimAndEnqueueCustomerRecovery({
        creatorProfileId: '11111111-1111-4111-8111-111111111111',
        spotifyUrl: 'https://open.spotify.com/artist/artist-1',
      })
    ).resolves.toBeNull();
  });
});
