import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import type { SanitizedArtist } from '@/lib/spotify/sanitize';
import {
  type AlgorithmHealthReport,
  generateHealthReport,
  generateUnavailableHealthReport,
} from '@/lib/spotify/scoring';
import type { Contact } from '@/types';

/**
 * Algorithm health fixtures shared by the AlgorithmHealthPanel certificate
 * test and state stories. Reports come from the real scoring functions so
 * every state stays inside the production report contract.
 */
export const ALGORITHM_HEALTH_CHECKED_AT = '2026-01-15T12:00:00.000Z';
export const SPOTIFY_ARTIST_ID = '4Z8W4fKeB5YxbusRsdQVPb';

export const algorithmHealthProfile: AdminCreatorProfileRow = {
  id: 'profile-1',
  username: 'alice',
  usernameNormalized: 'alice',
  avatarUrl: null,
  displayName: 'Alice',
  isVerified: false,
  isFeatured: false,
  marketingOptOut: false,
  location: null,
  hometown: null,
  activeSinceYear: null,
  isClaimed: true,
  claimToken: null,
  claimTokenExpiresAt: null,
  userId: 'user-1',
  createdAt: new Date(ALGORITHM_HEALTH_CHECKED_AT),
  confidence: 0.8,
  ingestionStatus: 'idle',
  lastIngestionError: null,
  socialLinks: [],
};

export const contactWithoutSpotify: Contact = {
  id: 'profile-1',
  username: 'alice',
  displayName: 'Alice',
  socialLinks: [],
};

export const contactWithSpotify: Contact = {
  ...contactWithoutSpotify,
  socialLinks: [
    {
      id: 'link-spotify',
      label: 'Spotify',
      url: `https://open.spotify.com/artist/${SPOTIFY_ARTIST_ID}`,
      platform: 'spotify',
      platformType: 'music',
    },
  ],
};

export function buildArtist(
  spotifyId: string,
  name: string,
  popularity: number,
  followerCount: number,
  genres: string[] = ['indie pop']
): SanitizedArtist {
  return {
    spotifyId,
    name,
    bio: null,
    imageUrl: null,
    genres,
    followerCount,
    popularity,
    externalUrls: {},
  };
}

const target = buildArtist(SPOTIFY_ARTIST_ID, 'Alice', 40, 12_000);

export const readyReport: AlgorithmHealthReport = generateHealthReport(
  target,
  [
    buildArtist('n1', 'Harbor Lights', 62, 90_000),
    buildArtist('n2', 'Velvet Static', 55, 48_000),
    buildArtist('n3', 'Paper Comets', 51, 31_000),
    buildArtist('n4', 'Quiet Arcade', 22, 4_000),
  ],
  { checkedAt: ALGORITHM_HEALTH_CHECKED_AT }
);

/** Only some related artists resolved, so the read carries a warning. */
export const partialReport: AlgorithmHealthReport = generateHealthReport(
  target,
  [
    buildArtist('n1', 'Harbor Lights', 62, 90_000),
    buildArtist('n2', 'Quiet Arcade', 22, 4_000),
    buildArtist('n3', 'Paper Comets', 41, 9_000),
  ],
  {
    checkedAt: ALGORITHM_HEALTH_CHECKED_AT,
    attemptedNeighbourCount: 7,
    warnings: ['4 related artists could not be resolved from Spotify.'],
  }
);

export const emptyReport: AlgorithmHealthReport = generateHealthReport(
  target,
  [],
  { checkedAt: ALGORITHM_HEALTH_CHECKED_AT, attemptedNeighbourCount: 6 }
);

export const unavailableReport: AlgorithmHealthReport =
  generateUnavailableHealthReport(target, {
    checkedAt: ALGORITHM_HEALTH_CHECKED_AT,
  });

export const longContentReport: AlgorithmHealthReport = generateHealthReport(
  target,
  [
    buildArtist(
      'n1',
      'The Extraordinarily Long Named Midnight Orchestra And Friends Collective',
      70,
      2_400_000
    ),
    buildArtist(
      'n2',
      'Somebody With An Unreasonably Long Stage Name For Overflow Checks',
      38,
      11_000
    ),
  ],
  {
    checkedAt: ALGORITHM_HEALTH_CHECKED_AT,
    attemptedNeighbourCount: 4,
    warnings: [
      'Spotify returned a related-artists response with several entries that were missing follower counts, so the size comparison relied on popularity alone for those artists.',
    ],
  }
);

export const rtlReport: AlgorithmHealthReport = generateHealthReport(
  target,
  [
    buildArtist('n1', 'فرقة منتصف الليل', 60, 70_000, ['pop arabe']),
    buildArtist('n2', 'להקת הנמל', 35, 8_000, ['indie pop']),
  ],
  { checkedAt: ALGORITHM_HEALTH_CHECKED_AT, attemptedNeighbourCount: 2 }
);
