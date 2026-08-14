import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  tx: { select: vi.fn() },
  inArray: vi.fn((_column: unknown, values: readonly string[]) => values),
  eq: vi.fn(),
  markProcessing: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: hoisted.eq,
  inArray: hoisted.inArray,
}));
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    isClaimed: 'is_claimed',
    usernameNormalized: 'username_normalized',
    avatarUrl: 'avatar_url',
    displayName: 'display_name',
    avatarLockedByUser: 'avatar_locked_by_user',
    displayNameLocked: 'display_name_locked',
    isPublic: 'is_public',
    claimToken: 'claim_token',
    claimTokenExpiresAt: 'claim_token_expires_at',
  },
}));
vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: (callback: (tx: unknown) => unknown) =>
    callback(hoisted.tx),
}));
vi.mock('@/lib/ingestion/status-manager', () => ({
  IngestionStatusManager: {
    markProcessing: hoisted.markProcessing,
    markIdleOrFailed: vi.fn(),
  },
}));
vi.mock('@/lib/ingestion/strategies/linktree', () => ({
  isValidHandle: (handle: string) => /^[a-z0-9][a-z0-9_-]+$/.test(handle),
}));

function selectResult(result: unknown[]) {
  const query = Promise.resolve(result) as Promise<unknown[]> & {
    limit: (count: number) => Promise<unknown[]>;
  };
  query.limit = vi.fn(async () => result);
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => query),
    })),
  };
}

describe('profile ingestion handle allocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allocates a suffixed handle instead of a protected exact identity', async () => {
    hoisted.tx.select
      .mockReturnValueOnce(selectResult([]))
      .mockReturnValueOnce(selectResult([]));

    const { checkExistingProfile } = await import('./profile-operations');
    const result = await checkExistingProfile('dualipa');

    expect(result.existing).toBeUndefined();
    expect(result.finalHandle).toBe('dualipa_1');
    const candidates = hoisted.inArray.mock.calls[0]?.[1] as string[];
    expect(candidates).not.toContain('dualipa');
    expect(candidates).toContain('dualipa_1');
  });

  it('keeps the dedicated claim-flow fixture available at its exact handle', async () => {
    hoisted.tx.select.mockReturnValueOnce(selectResult([]));

    const { checkExistingProfile } = await import('./profile-operations');
    const result = await checkExistingProfile('e2eclaimartist');

    expect(result.finalHandle).toBe('e2eclaimartist');
    expect(hoisted.inArray).not.toHaveBeenCalled();
  });
});
