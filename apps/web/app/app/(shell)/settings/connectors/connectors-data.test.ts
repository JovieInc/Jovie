import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ select: vi.fn(), user: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: { select: mocks.select } }));
vi.mock('@/lib/db/queries/shared', () => ({ getUserByClerkId: mocks.user }));
vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  inArray: (...args: unknown[]) => args,
}));
vi.mock('@/lib/db/schema/connectors', () => ({
  connectorAccounts: {},
  suggestedActions: {},
}));

import { loadSettingsConnectorsData } from './connectors-data';

function query(rows: unknown[]) {
  return {
    from: () => ({
      where: () =>
        Object.assign(Promise.resolve(rows), {
          limit: () => Promise.resolve(rows),
        }),
    }),
  };
}

describe('account settings scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: 'database-user' });
  });
  it('shows only the selected profile YouTube account while preserving user-scoped Google connections', async () => {
    mocks.select
      .mockReturnValueOnce(
        query([
          {
            provider: 'youtube',
            creatorProfileId: 'other',
            status: 'connected',
            providerAccountId: 'wrong-channel',
          },
          {
            provider: 'youtube',
            creatorProfileId: 'selected',
            status: 'needs_reauth',
            providerAccountId: 'right-channel',
            lastErrorUserMessage: 'Reconnect this channel',
          },
          {
            provider: 'gmail',
            creatorProfileId: null,
            status: 'connected',
            providerAccountId: 'artist@example.com',
          },
        ])
      )
      .mockReturnValueOnce(query([]));
    const data = await loadSettingsConnectorsData('auth-user', 'selected');
    expect(data?.accounts.youtube).toMatchObject({
      status: 'needs_reauth',
      email: 'right-channel',
      errorMessage: 'Reconnect this channel',
    });
    expect(data?.accounts.gmail).toMatchObject({
      status: 'connected',
      email: 'artist@example.com',
    });
    expect(data?.calendar.status).toBe('not_connected');
  });
  it('does not pick another profile account when no profile is selected', async () => {
    mocks.select
      .mockReturnValueOnce(
        query([
          {
            provider: 'youtube',
            creatorProfileId: 'other',
            status: 'connected',
            providerAccountId: 'wrong-channel',
          },
        ])
      )
      .mockReturnValueOnce(query([]));
    expect(
      (await loadSettingsConnectorsData('auth-user'))?.accounts.youtube.status
    ).toBe('not_connected');
  });
  it('returns no account state for an unknown user', async () => {
    mocks.user.mockResolvedValue(null);
    expect(await loadSettingsConnectorsData('unknown')).toBeNull();
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it('propagates database outages rather than inventing disconnected accounts', async () => {
    mocks.select.mockImplementation(() => {
      throw new Error('database offline');
    });
    await expect(loadSettingsConnectorsData('auth-user')).rejects.toThrow(
      'database offline'
    );
  });
});
