import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redeemWaitlistInviteToken } from '@/lib/waitlist/redeem';

const mockWithSerializableRetry = vi.hoisted(() => vi.fn());
const mockWithSystemIngestionSession = vi.hoisted(() => vi.fn());
const mockInvalidateProxyUserStateCache = vi.hoisted(() => vi.fn());
const mockInsertWaitlistAuditLog = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db/serializable-retry', () => ({
  withSerializableRetry: mockWithSerializableRetry,
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: mockWithSystemIngestionSession,
}));

vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: mockInvalidateProxyUserStateCache,
}));

vi.mock('@/lib/waitlist/audit', () => ({
  insertWaitlistAuditLog: mockInsertWaitlistAuditLog,
}));

type Row = Record<string, unknown>;

function createTxMock(selectResults: Row[][]) {
  const selectQueue = [...selectResults];
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        for: vi.fn(() => ({
          limit: vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve(selectQueue.shift() ?? [])
            ),
        })),
      })),
    })),
  }));

  return {
    select,
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue(undefined),
    })),
  } as never;
}

describe('redeemWaitlistInviteToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWithSerializableRetry.mockImplementation(async callback => callback());
  });

  it('allows a redeemed approved token only for the linked approved user before expiry', async () => {
    const inviteToken = 'redeemed-token-with-enough-entropy-for-tests';
    const tx = createTxMock([
      [
        {
          id: 'entry-1',
          email: 'creator@example.com',
          emailNormalized: 'creator@example.com',
          status: 'approved',
          inviteTokenExpiresAt: new Date(Date.now() + 60_000),
          inviteTokenRedeemedAt: new Date(),
        },
      ],
      [
        {
          waitlistEntryId: 'entry-1',
          userStatus: 'waitlist_approved',
        },
      ],
    ]);
    mockWithSystemIngestionSession.mockImplementation(async callback =>
      callback(tx)
    );

    const result = await redeemWaitlistInviteToken({
      token: inviteToken,
      clerkUserId: 'clerk_123',
      verifiedEmail: 'Creator@Example.com',
    });

    expect(result).toEqual({
      outcome: 'approved',
      entryId: 'entry-1',
      clerkId: 'clerk_123',
    });
    expect(mockInvalidateProxyUserStateCache).toHaveBeenCalledWith('clerk_123');
  });

  it('rejects a redeemed approved token for an unlinked user', async () => {
    const inviteToken = 'redeemed-token-with-enough-entropy-for-tests';
    const tx = createTxMock([
      [
        {
          id: 'entry-1',
          email: 'creator@example.com',
          emailNormalized: 'creator@example.com',
          status: 'approved',
          inviteTokenExpiresAt: new Date(Date.now() + 60_000),
          inviteTokenRedeemedAt: new Date(),
        },
      ],
      [
        {
          waitlistEntryId: 'other-entry',
          userStatus: 'waitlist_approved',
        },
      ],
    ]);
    mockWithSystemIngestionSession.mockImplementation(async callback =>
      callback(tx)
    );

    const result = await redeemWaitlistInviteToken({
      token: inviteToken,
      clerkUserId: 'clerk_456',
      verifiedEmail: 'creator@example.com',
    });

    expect(result).toEqual({ outcome: 'invalid' });
    expect(mockInvalidateProxyUserStateCache).not.toHaveBeenCalled();
  });

  it('rejects a redeemed approved token after expiry', async () => {
    const inviteToken = 'redeemed-token-with-enough-entropy-for-tests';
    const tx = createTxMock([
      [
        {
          id: 'entry-1',
          email: 'creator@example.com',
          emailNormalized: 'creator@example.com',
          status: 'approved',
          inviteTokenExpiresAt: new Date(Date.now() - 60_000),
          inviteTokenRedeemedAt: new Date(Date.now() - 120_000),
        },
      ],
    ]);
    mockWithSystemIngestionSession.mockImplementation(async callback =>
      callback(tx)
    );

    const result = await redeemWaitlistInviteToken({
      token: inviteToken,
      clerkUserId: 'clerk_123',
      verifiedEmail: 'creator@example.com',
    });

    expect(result).toEqual({ outcome: 'invalid' });
  });
});
