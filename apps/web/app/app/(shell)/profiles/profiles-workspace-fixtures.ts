import { APP_ROUTES } from '@/constants/routes';
import type { ProfilesWorkspaceData } from './data';

export const data: ProfilesWorkspaceData = {
  profileId: '11111111-1111-4111-8111-111111111111',
  artist: {
    name: 'Tim White',
    username: 'tim',
    avatarUrl: 'https://cdn.jov.ie/tim.jpg',
    isPublic: true,
  },
  rows: [
    {
      id: 'jovie',
      rowType: 'surface',
      kind: 'jovie',
      platform: 'jovie',
      label: 'Jovie Profile',
      handle: '@tim',
      url: 'https://jov.ie/tim',
      trackedUrl: null,
      qualificationStatus: 'qualified',
      isOfficial: true,
      monitoringState: 'active',
      rank: 2,
      previousRank: 4,
      lastObservedAt: '2026-07-16T00:00:00.000Z',
      identityPhoto: {
        url: 'https://cdn.jov.ie/tim.jpg',
        source: 'jovie',
        kind: 'profile',
        verified: true,
        observedAt: '2026-07-16T00:00:00.000Z',
        freshness: 'current',
      },
    },
    {
      id: 'spotify',
      rowType: 'surface',
      kind: 'dsp',
      platform: 'spotify',
      label: 'Spotify',
      handle: null,
      url: 'https://open.spotify.com/artist/tim',
      trackedUrl: 'https://jov.ie/tim/s/spotify',
      qualificationStatus: 'qualified',
      isOfficial: true,
      monitoringState: 'locked',
      rank: 7,
      previousRank: 9,
      lastObservedAt: '2026-07-16T00:00:00.000Z',
      identityPhoto: {
        url: 'https://i.scdn.co/image/tim.jpg',
        source: 'connector',
        kind: 'profile',
        verified: true,
        observedAt: '2026-07-16T00:00:00.000Z',
        freshness: 'current',
      },
    },
    {
      id: 'instagram',
      rowType: 'surface',
      kind: 'social',
      platform: 'instagram',
      label: 'Instagram',
      handle: '@tim',
      url: 'https://instagram.com/tim',
      trackedUrl: 'https://jov.ie/tim/s/instagram',
      qualificationStatus: 'qualified',
      isOfficial: true,
      monitoringState: 'active',
      rank: 4,
      previousRank: 5,
      lastObservedAt: '2026-07-16T00:00:00.000Z',
    },
  ],
  monitoringLimit: 5,
  monitoredCount: 1,
  qualifiedShare: 0.5,
  bestJovieRank: 2,
  lastObservedAt: '2026-07-16T00:00:00.000Z',
  providerAvailable: true,
};

export const dataWithConnector: ProfilesWorkspaceData = {
  ...data,
  rows: [
    ...data.rows,
    {
      id: 'gmail',
      rowType: 'connector',
      kind: 'connector',
      platform: 'gmail',
      label: 'Gmail',
      handle: 'artist@example.com',
      url: APP_ROUTES.SETTINGS_CONNECTORS,
      status: 'connected',
      monitoringState: 'active',
    },
  ],
};

export type SuggestionFixture = {
  readonly id: string;
  readonly type:
    | 'dsp_match'
    | 'social_link'
    | 'avatar'
    | 'playlist_fallback'
    | 'profile_ready';
  readonly platform: string;
  readonly platformLabel: string;
  readonly title: string;
  readonly subtitle: string;
  readonly imageUrl: string | null;
  readonly externalUrl: string | null;
  readonly confidence: number | null;
};
