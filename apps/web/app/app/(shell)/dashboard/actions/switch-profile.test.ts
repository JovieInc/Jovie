import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCachedAuth: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuth,
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.select,
    transaction: hoisted.transaction,
  },
}));
vi.mock('@/lib/auth/app-user-id', () => ({
  appUserIdFilter: vi.fn(),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));

describe('createAdditionalProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getCachedAuth.mockResolvedValue({ userId: 'user-1' });
  });

  it.each([
    'dualipa',
    'testartist',
    'authqaprod',
    'e2eclaimartist',
  ])('rejects protected identity %s before database access', async username => {
    const { createAdditionalProfile } = await import('./switch-profile');
    const result = await createAdditionalProfile({
      displayName: 'Protected Fixture',
      username,
    });

    expect(result).toEqual({
      success: false,
      error: 'Username is reserved',
    });
    expect(hoisted.select).not.toHaveBeenCalled();
    expect(hoisted.transaction).not.toHaveBeenCalled();
  });
});
