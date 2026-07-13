/**
 * POST /api/connectors/google/disconnect
 *
 * Only `@/lib/auth/cached`, `@/lib/db`, and `@/lib/error-tracking` are mocked.
 * `eq`/`and` from `drizzle-orm` are wrapped (not stubbed) with `vi.fn(actual)` so
 * assertions can inspect the exact WHERE-clause targeting while the real
 * schema/column objects and real SQL-builder logic still run underneath.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCachedAuthMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  captureErrorMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuthMock,
}));

vi.mock('@/lib/db', () => ({
  db: { select: hoisted.dbSelectMock, update: hoisted.dbUpdateMock },
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
import { GOOGLE_CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { connectorAccounts } from '@/lib/db/schema/connectors';

interface UpdateCall {
  readonly set: unknown;
  readonly where: unknown;
}

function selectReturns(rows: Array<{ id: string }>) {
  hoisted.dbSelectMock.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
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

function postRequest(body: unknown) {
  return new Request('http://localhost/api/connectors/google/disconnect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/connectors/google/disconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'clerk_1' });
    selectReturns([{ id: 'db-user-1' }]);
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: null });

    const { POST } = await import(
      '@/app/api/connectors/google/disconnect/route'
    );
    const response = await POST(postRequest({}));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
    expect(hoisted.dbSelectMock).not.toHaveBeenCalled();
    expect(hoisted.dbUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid provider value', async () => {
    const { POST } = await import(
      '@/app/api/connectors/google/disconnect/route'
    );
    const response = await POST(postRequest({ provider: 'not_a_provider' }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Invalid payload' });
    expect(hoisted.dbSelectMock).not.toHaveBeenCalled();
  });

  it('returns 404 when no DB user row exists for the Clerk id', async () => {
    selectReturns([]);
    const updateCalls = trackUpdates();

    const { POST } = await import(
      '@/app/api/connectors/google/disconnect/route'
    );
    const response = await POST(postRequest({}));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'User not found' });
    expect(updateCalls).toHaveLength(0);
  });

  it('disconnects only the requested provider when body.provider is set', async () => {
    const updateCalls = trackUpdates();

    const { POST } = await import(
      '@/app/api/connectors/google/disconnect/route'
    );
    const response = await POST(postRequest({ provider: 'gmail' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(updateCalls).toHaveLength(1);

    // WHERE must target this user's row AND the 'gmail' provider specifically —
    // not 'google_calendar', and not an unscoped update.
    expect(eq).toHaveBeenCalledWith(connectorAccounts.userId, 'db-user-1');
    expect(eq).toHaveBeenCalledWith(connectorAccounts.provider, 'gmail');
    expect(eq).not.toHaveBeenCalledWith(
      connectorAccounts.provider,
      'google_calendar'
    );
    expect(and).toHaveBeenCalledTimes(1);
  });

  it('disconnects both Google providers when body.provider is omitted', async () => {
    const updateCalls = trackUpdates();
    expect(GOOGLE_CONNECTOR_PROVIDERS).toEqual(['gmail', 'google_calendar']);

    const { POST } = await import(
      '@/app/api/connectors/google/disconnect/route'
    );
    const response = await POST(postRequest({}));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    // One update per provider in the shared Google OAuth bundle.
    expect(updateCalls).toHaveLength(2);
    expect(eq).toHaveBeenCalledWith(connectorAccounts.provider, 'gmail');
    expect(eq).toHaveBeenCalledWith(
      connectorAccounts.provider,
      'google_calendar'
    );
  });

  it('nulls the encrypted token columns and expiry on every disconnect update', async () => {
    const updateCalls = trackUpdates();

    const { POST } = await import(
      '@/app/api/connectors/google/disconnect/route'
    );
    await POST(postRequest({ provider: 'google_calendar' }));

    expect(updateCalls).toHaveLength(1);
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
      '@/app/api/connectors/google/disconnect/route'
    );
    const response = await POST(postRequest({ provider: 'gmail' }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'Internal error' });
    expect(hoisted.captureErrorMock).toHaveBeenCalledWith(
      'Google connector disconnect failed',
      expect.any(Error),
      expect.objectContaining({ route: '/api/connectors/google/disconnect' })
    );
  });
});
