/**
 * POST /api/connectors/spotify/disconnect
 *
 * Only `@/lib/auth/cached`, `@/lib/db`, and `@/lib/error-tracking` are mocked.
 * `eq`/`and` from `drizzle-orm` are wrapped (not stubbed) with `vi.fn(actual)`
 * so assertions can inspect the exact WHERE-clause targeting while the real
 * schema/column objects and real SQL-builder logic still run underneath.
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
  return {
    ...actual,
    eq: vi.fn(actual.eq),
    and: vi.fn(actual.and),
  };
});

import { and, eq } from 'drizzle-orm';
import { connectorAccounts } from '@/lib/db/schema/connectors';

interface UpdateCall {
  readonly set: unknown;
  readonly where: unknown;
}

function trackUpdates(): UpdateCall[] {
  const calls: UpdateCall[] = [];
  hoisted.dbUpdateMock.mockImplementation(() => ({
    set: (setArg: unknown) => ({
      where: (whereArg: unknown) => {
        calls.push({ set: setArg, where: whereArg });
        return Promise.resolve(undefined);
      },
    }),
  }));
  return calls;
}

describe('POST /api/connectors/spotify/disconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'db-user-1' });
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: null });

    const { POST } = await import(
      '@/app/api/connectors/spotify/disconnect/route'
    );
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
    expect(hoisted.dbUpdateMock).not.toHaveBeenCalled();
  });

  it('marks the spotify connector disabled and nulls stored tokens for the signed-in user only', async () => {
    const updateCalls = trackUpdates();

    const { POST } = await import(
      '@/app/api/connectors/spotify/disconnect/route'
    );
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(updateCalls).toHaveLength(1);

    // WHERE must target this user's row AND the 'spotify' provider —
    // not another provider, and not an unscoped update.
    expect(eq).toHaveBeenCalledWith(connectorAccounts.userId, 'db-user-1');
    expect(eq).toHaveBeenCalledWith(connectorAccounts.provider, 'spotify');
    expect(and).toHaveBeenCalledTimes(1);

    expect(JSON.stringify(updateCalls[0].set)).toContain('disabled');
    expect(updateCalls[0].set).toEqual(
      expect.objectContaining({
        encryptedAccessToken: null,
        encryptedRefreshToken: null,
        tokenExpiresAt: null,
        updatedAt: expect.any(Date),
      })
    );
  });

  it('returns 500 and captures the error when the update throws', async () => {
    hoisted.dbUpdateMock.mockImplementation(() => ({
      set: () => ({
        where: () => Promise.reject(new Error('db write failed')),
      }),
    }));

    const { POST } = await import(
      '@/app/api/connectors/spotify/disconnect/route'
    );
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'Internal error' });
    expect(hoisted.captureErrorMock).toHaveBeenCalledWith(
      'Spotify connector disconnect failed',
      expect.any(Error),
      expect.objectContaining({ route: '/api/connectors/spotify/disconnect' })
    );
  });
});
