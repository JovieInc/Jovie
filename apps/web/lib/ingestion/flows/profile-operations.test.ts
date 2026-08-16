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

  it.each([
    'dualipa',
    'testartist',
  ])('fails closed without reingesting an existing unclaimed protected row: %s', async handle => {
    hoisted.tx.select.mockReturnValueOnce(
      selectResult([{ usernameNormalized: handle }])
    );

    const { checkExistingProfile } = await import('./profile-operations');
    const result = await checkExistingProfile(handle);

    expect(result.existing).toBeNull();
    expect(result.isReingest).toBe(false);
    expect(result.finalHandle).toBe(`${handle}_1`);
    expect(hoisted.eq).not.toHaveBeenCalled();
    expect(hoisted.markProcessing).not.toHaveBeenCalled();
    const candidates = hoisted.inArray.mock.calls[0]?.[1] as string[];
    expect(candidates).not.toContain(handle);
    expect(candidates).toContain(`${handle}_1`);
  });

  it('reserves the claim-flow fixture from ingestion allocation', async () => {
    hoisted.tx.select.mockReturnValueOnce(selectResult([]));

    const { checkExistingProfile } = await import('./profile-operations');
    const result = await checkExistingProfile('e2eclaimartist');

    expect(result.existing).toBeNull();
    expect(result.isReingest).toBe(false);
    expect(result.finalHandle).toBe('e2eclaimartist_1');
    const candidates = hoisted.inArray.mock.calls[0]?.[1] as string[];
    expect(candidates).not.toContain('e2eclaimartist');
    expect(hoisted.markProcessing).not.toHaveBeenCalled();
  });
});
