import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetCachedAuth,
  mockRevokeSession,
  mockRevokeOtherSessions,
  mockUsersRow,
  mockSessionTokenRow,
  mockSessionListRows,
  UnauthorizedSessionError,
} = vi.hoisted(() => {
  class UnauthorizedSessionError extends Error {
    constructor() {
      super('Unauthorized');
      this.name = 'UnauthorizedSessionError';
    }
  }
  return {
    mockGetCachedAuth: vi.fn(),
    mockRevokeSession: vi.fn(),
    mockRevokeOtherSessions: vi.fn(),
    mockUsersRow: vi.fn(),
    mockSessionTokenRow: vi.fn(),
    mockSessionListRows: vi.fn(),
    UnauthorizedSessionError,
  };
});

vi.mock('server-only', () => ({}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock('@/lib/auth/better-auth', () => ({
  auth: {
    api: {
      revokeSession: mockRevokeSession,
      revokeOtherSessions: mockRevokeOtherSessions,
    },
  },
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));

vi.mock('@/lib/auth/session', () => ({
  UnauthorizedSessionError,
  requireAuth: async () => {
    const { userId } = await mockGetCachedAuth();
    if (!userId) throw new UnauthorizedSessionError();
    return userId;
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ _type: 'eq', col, val })),
  desc: vi.fn((col: unknown) => ({ _type: 'desc', col })),
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'users.id', betterAuthUserId: 'users.betterAuthUserId' },
}));

vi.mock('@/lib/db/schema/better-auth', () => ({
  baSessions: {
    id: 'baSessions.id',
    userId: 'baSessions.userId',
    ipAddress: 'baSessions.ipAddress',
    userAgent: 'baSessions.userAgent',
    updatedAt: 'baSessions.updatedAt',
    expiresAt: 'baSessions.expiresAt',
    token: 'baSessions.token',
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (table: { id: string }) => {
        const isUsersTable = table.id === 'users.id';
        return {
          where: () => ({
            limit: async () =>
              isUsersTable ? mockUsersRow() : mockSessionTokenRow(),
            orderBy: async () => mockSessionListRows(),
          }),
        };
      },
    }),
  },
}));

import {
  CannotRevokeCurrentSessionError,
  listAccountSessions,
  revokeAccountSession,
  revokeOtherAccountSessions,
  SessionNotFoundError,
} from './sessions';

const BETTER_AUTH_USER_ID = 'ba-user-1';
const OTHER_BETTER_AUTH_USER_ID = 'ba-user-2';

describe('sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsersRow.mockResolvedValue([{ betterAuthUserId: BETTER_AUTH_USER_ID }]);
  });

  describe('listAccountSessions', () => {
    it('throws when unauthenticated', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null, sessionId: null });

      await expect(listAccountSessions()).rejects.toThrow(
        UnauthorizedSessionError
      );
    });

    it('marks the current session and filters expired ones', async () => {
      mockGetCachedAuth.mockResolvedValue({
        userId: 'app-user-1',
        sessionId: 'session-current',
      });
      const future = new Date(Date.now() + 60_000);
      const past = new Date(Date.now() - 60_000);
      mockSessionListRows.mockResolvedValue([
        {
          id: 'session-current',
          ipAddress: '1.1.1.1',
          userAgent: 'ua-1',
          updatedAt: future,
          expiresAt: future,
        },
        {
          id: 'session-other',
          ipAddress: '2.2.2.2',
          userAgent: 'ua-2',
          updatedAt: future,
          expiresAt: future,
        },
        {
          id: 'session-expired',
          ipAddress: '3.3.3.3',
          userAgent: 'ua-3',
          updatedAt: past,
          expiresAt: past,
        },
      ]);

      const sessions = await listAccountSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions.find(s => s.id === 'session-current')?.isCurrent).toBe(
        true
      );
      expect(sessions.find(s => s.id === 'session-other')?.isCurrent).toBe(
        false
      );
      expect(sessions.some(s => s.id === 'session-expired')).toBe(false);
    });
  });

  describe('revokeAccountSession', () => {
    beforeEach(() => {
      mockGetCachedAuth.mockResolvedValue({
        userId: 'app-user-1',
        sessionId: 'session-current',
      });
      mockRevokeSession.mockResolvedValue({ status: true });
    });

    it('refuses to revoke the active session', async () => {
      await expect(revokeAccountSession('session-current')).rejects.toThrow(
        CannotRevokeCurrentSessionError
      );
      expect(mockRevokeSession).not.toHaveBeenCalled();
    });

    it('refuses to revoke a session owned by another user', async () => {
      mockSessionTokenRow.mockResolvedValue([
        { token: 'stolen-token', userId: OTHER_BETTER_AUTH_USER_ID },
      ]);

      await expect(revokeAccountSession('session-not-mine')).rejects.toThrow(
        SessionNotFoundError
      );
      expect(mockRevokeSession).not.toHaveBeenCalled();
    });

    it('throws when the session id does not exist', async () => {
      mockSessionTokenRow.mockResolvedValue([]);

      await expect(revokeAccountSession('missing')).rejects.toThrow(
        SessionNotFoundError
      );
    });

    it('revokes an owned session via the Better Auth API', async () => {
      mockSessionTokenRow.mockResolvedValue([
        { token: 'my-token', userId: BETTER_AUTH_USER_ID },
      ]);

      await revokeAccountSession('session-mine');

      expect(mockRevokeSession).toHaveBeenCalledWith(
        expect.objectContaining({ body: { token: 'my-token' } })
      );
    });

    it('throws when Better Auth reports failure', async () => {
      mockSessionTokenRow.mockResolvedValue([
        { token: 'my-token', userId: BETTER_AUTH_USER_ID },
      ]);
      mockRevokeSession.mockResolvedValue({ status: false });

      await expect(revokeAccountSession('session-mine')).rejects.toThrow();
    });
  });

  describe('revokeOtherAccountSessions', () => {
    it('throws when unauthenticated', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null, sessionId: null });

      await expect(revokeOtherAccountSessions()).rejects.toThrow(
        UnauthorizedSessionError
      );
      expect(mockRevokeOtherSessions).not.toHaveBeenCalled();
    });

    it('calls Better Auth to revoke every other session', async () => {
      mockGetCachedAuth.mockResolvedValue({
        userId: 'app-user-1',
        sessionId: 'session-current',
      });
      mockRevokeOtherSessions.mockResolvedValue({ status: true });

      await revokeOtherAccountSessions();

      expect(mockRevokeOtherSessions).toHaveBeenCalledOnce();
    });
  });
});
