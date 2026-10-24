import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock('@/lib/db', () => ({ db: { select: mocks.select } }));

import { isEarlyAccess } from './server';

function mockRow(row: unknown) {
  mocks.select.mockReturnValue({
    from: () => ({
      where: () => ({ limit: async () => (row ? [row] : []) }),
    }),
  });
}

describe('isEarlyAccess', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires the Jovie product, early-access mode, and active consent', async () => {
    mockRow({
      products: ['jov'],
      allowedModes: ['early_access'],
      consent: { grantedAt: '2026-10-24T00:00:00.000Z', revokedAt: null },
    });

    await expect(isEarlyAccess({ id: 'user-1' })).resolves.toBe(true);
  });

  it.each([
    { products: ['lyb'], allowedModes: ['early_access'] },
    { products: ['jov'], allowedModes: ['customer_control'] },
    { products: ['jov'], allowedModes: ['early_access'], revokedAt: 'now' },
  ])('rejects an incomplete cohort row', async row => {
    mockRow({
      ...row,
      consent: {
        grantedAt: '2026-10-24T00:00:00.000Z',
        revokedAt: row.revokedAt ?? null,
      },
    });

    await expect(isEarlyAccess({ id: 'user-1' })).resolves.toBe(false);
  });

  it('rejects an account without a dogfooder row', async () => {
    mockRow(null);
    await expect(isEarlyAccess({ id: 'user-1' })).resolves.toBe(false);
  });
});
