import type { AlgorithmHealthReport } from '@/lib/spotify/scoring';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

const HEALTH_FIXTURE_IMAGE =
  'https://i.scdn.co/image/ab6761610000e5eb0bae7cfd3fb1b2866db6bc8d';

export const ALGORITHM_HEALTH_E2E_REPORT: AlgorithmHealthReport = {
  targetArtist: {
    spotifyId: '4u',
    name: 'Tim White',
    bio: null,
    imageUrl: HEALTH_FIXTURE_IMAGE,
    genres: ['indie pop', 'alt pop'],
    followerCount: 182340,
    popularity: 52,
    externalUrls: {
      spotify: `https://open.spotify.com/artist/${TIM_WHITE_PROFILE.spotifyArtistId}`,
    },
  },
  healthScore: 50,
  summary: {
    bigger: 2,
    similar: 1,
    smaller: 1,
    total: 4,
  },
  neighbours: [
    {
      artist: {
        spotifyId: 'fixture-bigger-1',
        name: 'Night Drive Club',
        bio: null,
        imageUrl: HEALTH_FIXTURE_IMAGE,
        genres: ['indie pop', 'synth pop'],
        followerCount: 402100,
        popularity: 67,
        externalUrls: {},
      },
      size: 'BIGGER',
      popularityDelta: 15,
      followerDelta: 219760,
      genreOverlap: 0.5,
      authenticity: { level: 'CLEAN', reasons: [] },
    },
    {
      artist: {
        spotifyId: 'fixture-bigger-2',
        name: 'Velvet Season',
        bio: null,
        imageUrl: HEALTH_FIXTURE_IMAGE,
        genres: ['alt pop', 'indietronica'],
        followerCount: 260800,
        popularity: 60,
        externalUrls: {},
      },
      size: 'BIGGER',
      popularityDelta: 8,
      followerDelta: 78460,
      genreOverlap: 0.33,
      authenticity: { level: 'CLEAN', reasons: [] },
    },
    {
      artist: {
        spotifyId: 'fixture-similar-1',
        name: 'Signal Hearts',
        bio: null,
        imageUrl: HEALTH_FIXTURE_IMAGE,
        genres: ['indie pop', 'alt pop'],
        followerCount: 171900,
        popularity: 51,
        externalUrls: {},
      },
      size: 'SIMILAR',
      popularityDelta: -1,
      followerDelta: -10440,
      genreOverlap: 1,
      authenticity: {
        level: 'CAUTION',
        reasons: ['No genres despite significant followers'],
      },
    },
    {
      artist: {
        spotifyId: 'fixture-smaller-1',
        name: 'Static Bloom',
        bio: null,
        imageUrl: HEALTH_FIXTURE_IMAGE,
        genres: ['bedroom pop'],
        followerCount: 42300,
        popularity: 35,
        externalUrls: {},
      },
      size: 'SMALLER',
      popularityDelta: -17,
      followerDelta: -140040,
      genreOverlap: 0,
      authenticity: {
        level: 'SUSPECT',
        reasons: [
          'High followers but near-zero popularity',
          'Follower count vastly exceeds popularity signal',
        ],
      },
    },
  ],
};
