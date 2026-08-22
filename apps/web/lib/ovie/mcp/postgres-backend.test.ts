import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const returning = vi.fn(async () => [{ key: 'claim-key' }]);
  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values }));
  return { insert, onConflictDoNothing, returning, values };
});

vi.mock('@/lib/db', () => ({ db: { insert: mocks.insert } }));

import { postgresRecordBackend } from './postgres-backend';

describe('postgresRecordBackend', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts a claim only when absent without deriving expiry from claimant TTL', async () => {
    const backend = postgresRecordBackend();

    await expect(
      backend.setIfAbsent('claim-key', 'stored-lease', 120)
    ).resolves.toBe(true);

    expect(mocks.onConflictDoNothing).toHaveBeenCalledOnce();
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'claim-key', value: 'stored-lease' })
    );
  });
});
