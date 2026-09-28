/**
 * POST /api/connectors/spotify/disconnect — only auth, db, and error-tracking
 * are mocked. `eq`/`and` are wrapped (not stubbed) so assertions can inspect
 * the exact WHERE-clause targeting while real SQL-builder logic runs.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCachedAuthMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  captureErrorMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuthMock,
}));
vi.mock('@/lib/db', () => ({
  db: { update: hoisted.dbUpdateMock },
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));
vi.mock('drizzle-orm', async importOriginal => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return { ...actual, eq: vi.fn(actual.eq), and: vi.fn(actual.and) };
});

import { and, eq } from 'drizzle-orm';
import { connectorAccounts } from '@/lib/db/schema/connectors';

function trackUpdates() {
  const calls: { set: unknown; where: unknown }[] = [];
  hoisted.dbUpdateMock.mockImplementation(() => ({
    set: (set: unknown) => ({
      where: (where: unknown) => {
        calls.push({ set, where });
        return Promise.resolve(undefined);
      },
    }),
  }));
  return calls;
}

const LOAD_ROUTE = () =>
  import('@/app/api/connectors/spotify/disconnect/route');

describe('POST /api/connectors/spotify/disconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'db-user-1' });
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: null });
    const { POST } = await LOAD_ROUTE();
    const response = await POST();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(hoisted.dbUpdateMock).not.toHaveBeenCalled();
  });

  it('marks the spotify connector disabled and nulls stored tokens for the signed-in user only', async () => {
    const updates = trackUpdates();
    const { POST } = await LOAD_ROUTE();
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(updates).toHaveLength(1);

    // WHERE must target this user's row AND the 'spotify' provider.
    expect(eq).toHaveBeenCalledWith(connectorAccounts.userId, 'db-user-1');
    expect(eq).toHaveBeenCalledWith(connectorAccounts.provider, 'spotify');
    expect(and).toHaveBeenCalledTimes(1);
    expect(updates[0].set).toEqual(
      expect.objectContaining({
        encryptedAccessToken: null,
        encryptedRefreshToken: null,
        tokenExpiresAt: null,
        updatedAt: expect.any(Date),
      })
    );
    expect(JSON.stringify(updates[0].set)).toContain('disabled');
  });

  it('returns 500 and captures the error when the update throws', async () => {
    hoisted.dbUpdateMock.mockImplementation(() => ({
      set: () => ({
        where: () => Promise.reject(new Error('db write failed')),
      }),
    }));
    const { POST } = await LOAD_ROUTE();
    const response = await POST();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal error' });
    expect(hoisted.captureErrorMock).toHaveBeenCalledWith(
      'Spotify connector disconnect failed',
      expect.any(Error),
      expect.objectContaining({ route: '/api/connectors/spotify/disconnect' })
    );
  });
});
