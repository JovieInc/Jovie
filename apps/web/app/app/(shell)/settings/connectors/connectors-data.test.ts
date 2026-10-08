import { beforeEach, describe, expect, it, vi } from 'vitest';
import { YOUTUBE_OAUTH_SCOPES } from '@/lib/connectors/youtube/scopes';

const { getUserByClerkId, select } = vi.hoisted(() => ({
  getUserByClerkId: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: { select } }));
vi.mock('@/lib/db/queries/shared', () => ({ getUserByClerkId }));

import { loadSettingsConnectorsData } from './connectors-data';

describe('loadSettingsConnectorsData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserByClerkId.mockResolvedValue({ id: 'database-user' });
  });

  it('maps every provider and scopes YouTube state to the selected profile', async () => {
    select.mockReturnValueOnce({
      from: () => ({
        where: async () => [
          {
            provider: 'spotify',
            status: 'connected',
            providerAccountId: 'spotify-user',
            creatorProfileId: null,
            scopes: ['user-read-email'],
            capabilities: {},
            lastErrorUserMessage: null,
          },
          {
            provider: 'youtube',
            status: 'connected',
            providerAccountId: 'wrong-channel',
            creatorProfileId: 'other-profile',
            scopes: YOUTUBE_OAUTH_SCOPES,
            capabilities: { channelTitle: 'Wrong Channel' },
            lastErrorUserMessage: null,
          },
          {
            provider: 'youtube',
            status: 'connected',
            providerAccountId: 'channel-1',
            creatorProfileId: 'profile-1',
            scopes: YOUTUBE_OAUTH_SCOPES,
            capabilities: { channelTitle: 'Artist Channel' },
            lastErrorUserMessage: null,
          },
        ],
      }),
    });

    const data = await loadSettingsConnectorsData(
      'better-auth-user',
      'profile-1'
    );

    expect(select).toHaveBeenCalledTimes(1);
    expect(data).not.toHaveProperty('suggestedActions');
    expect(data?.connectors).toMatchObject({
      gmail: { status: 'not_connected' },
      google_calendar: { status: 'not_connected' },
      spotify: {
        status: 'connected',
        accountLabel: 'spotify-user',
        scopes: ['user-read-email'],
      },
      youtube: {
        status: 'connected',
        accountLabel: 'Artist Channel',
        scopes: YOUTUBE_OAUTH_SCOPES,
      },
    });
  });
  it('does not query connections or actions for an unknown account', async () => {
    getUserByClerkId.mockResolvedValue(null);
    await expect(
      loadSettingsConnectorsData('unknown-user', null)
    ).resolves.toBeNull();
    expect(select).not.toHaveBeenCalled();
  });

  it('does not expose another identity or a legacy unbound YouTube account', async () => {
    select.mockReturnValueOnce({
      from: () => ({
        where: async () => [
          {
            provider: 'spotify',
            status: 'connected',
            providerAccountId: 'other-identity',
            creatorProfileId: 'other-profile',
            scopes: [],
            capabilities: {},
            lastErrorUserMessage: null,
          },
          {
            provider: 'youtube',
            status: 'connected',
            providerAccountId: 'legacy-channel',
            creatorProfileId: null,
            scopes: YOUTUBE_OAUTH_SCOPES,
            capabilities: {},
            lastErrorUserMessage: null,
          },
        ],
      }),
    });
    const data = await loadSettingsConnectorsData(
      'better-auth-user',
      'profile-1'
    );
    expect(data?.connectors.spotify.status).toBe('not_connected');
    expect(data?.connectors.youtube.status).toBe('not_connected');
    expect(JSON.stringify(data)).not.toContain('other-identity');
    expect(JSON.stringify(data)).not.toContain('legacy-channel');
  });

  it('retains actual sync provenance and fails closed on an unknown persisted status', async () => {
    select.mockReturnValueOnce({
      from: () => ({
        where: async () => [
          {
            provider: 'gmail',
            status: 'connected',
            providerAccountId: 'me@example.test',
            creatorProfileId: null,
            scopes: [],
            capabilities: {},
            lastSyncAt: new Date('2026-10-07T19:30:00Z'),
            lastErrorUserMessage: null,
          },
          {
            provider: 'spotify',
            status: 'future_status',
            providerAccountId: 'spotify-user',
            creatorProfileId: null,
            scopes: [],
            capabilities: {},
            lastErrorUserMessage: null,
          },
        ],
      }),
    });
    const data = await loadSettingsConnectorsData('better-auth-user', null);
    expect(data?.connectors.gmail.lastSyncAt).toBe('2026-10-07T19:30:00.000Z');
    expect(data?.connectors.spotify.status).toBe('unavailable');
  });

  it('preserves the missing connector schema fallback without loading actions', async () => {
    select.mockImplementationOnce(() => {
      throw new Error('relation "connector_accounts" does not exist');
    });
    const data = await loadSettingsConnectorsData('better-auth-user', null);
    expect(
      Object.values(data?.connectors ?? {}).map(value => value.status)
    ).toEqual(['unavailable', 'unavailable', 'unavailable', 'unavailable']);
    expect(data).not.toHaveProperty('suggestedActions');
    expect(select).toHaveBeenCalledOnce();
  });

  it('propagates unavailable reads instead of reporting disconnected accounts', async () => {
    const unavailable = new Error('Connection timed out');
    select.mockImplementationOnce(() => {
      throw unavailable;
    });
    await expect(
      loadSettingsConnectorsData('better-auth-user', null)
    ).rejects.toBe(unavailable);
  });
});
