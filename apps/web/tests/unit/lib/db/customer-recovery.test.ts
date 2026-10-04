import { describe, expect, it, vi } from 'vitest';

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
  it('returns an id only when the atomic claim inserts a job', async () => {
    mocks.execute.mockResolvedValue({ rows: [{ id: 'job-1' }] });
    const input = {
      creatorProfileId: '11111111-1111-4111-8111-111111111111',
      spotifyUrl: 'https://open.spotify.com/artist/artist-1',
    };
    await expect(claimAndEnqueueCustomerRecovery(input)).resolves.toBe('job-1');

    mocks.execute.mockResolvedValue({ rows: [] });
    await expect(claimAndEnqueueCustomerRecovery(input)).resolves.toBeNull();
  });
});
