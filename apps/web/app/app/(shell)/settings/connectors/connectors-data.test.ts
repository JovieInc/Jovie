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
    select
      .mockReturnValueOnce({
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
      })
      .mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: async () => [] }) }),
      });

    const data = await loadSettingsConnectorsData(
      'better-auth-user',
      'profile-1'
    );

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
});
