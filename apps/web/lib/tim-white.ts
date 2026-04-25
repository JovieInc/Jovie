import { TIM_WHITE_SPOTIFY_ID } from '@/lib/spotify/blacklist';

export const TIM_WHITE_PROFILE = {
  name: 'Tim White',
  handle: 'timwhite',
  publicProfileHandle: 'tim',
  publicProfilePath: '/tim',
  publicProfileUrl: 'https://jov.ie/tim',
  publicProfileDisplay: 'jov.ie/tim',
  avatarSrc: '/images/avatars/tim-white-founder.jpg',
  spotifyArtistId: TIM_WHITE_SPOTIFY_ID,
  spotifyUrl: `https://open.spotify.com/artist/${TIM_WHITE_SPOTIFY_ID}`,
} as const;
