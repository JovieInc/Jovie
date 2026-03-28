import { TIM_WHITE_SPOTIFY_ID } from '@/lib/spotify/blacklist';

export const TIM_WHITE_PROFILE = {
  name: 'Tim White',
  handle: 'timwhite',
  avatarSrc: '/images/avatars/tim-white-founder.jpg',
  spotifyArtistId: TIM_WHITE_SPOTIFY_ID,
  spotifyUrl: `https://open.spotify.com/artist/${TIM_WHITE_SPOTIFY_ID}`,
} as const;
