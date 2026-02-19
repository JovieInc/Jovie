import type { ProviderKey, ReleaseTemplate } from './types';

export const PROVIDER_CONFIG: Record<
  ProviderKey,
  { label: string; accent: string }
> = {
  spotify: { label: 'Spotify', accent: '#1DB954' },
  apple_music: { label: 'Apple Music', accent: '#FA243C' },
  youtube: { label: 'YouTube', accent: '#FF0000' },
  soundcloud: { label: 'SoundCloud', accent: '#FF5500' },
  deezer: { label: 'Deezer', accent: '#2F9AFF' },
  tidal: { label: 'Tidal', accent: '#000000' },
  amazon_music: { label: 'Amazon Music', accent: '#146EB4' },
  bandcamp: { label: 'Bandcamp', accent: '#629AA0' },
  beatport: { label: 'Beatport', accent: '#A3E422' },
  pandora: { label: 'Pandora', accent: '#224099' },
  napster: { label: 'Napster', accent: '#2259FF' },
  audiomack: { label: 'Audiomack', accent: '#FFA200' },
  qobuz: { label: 'Qobuz', accent: '#0070EF' },
  anghami: { label: 'Anghami', accent: '#F300F9' },
  boomplay: { label: 'Boomplay', accent: '#0052FF' },
  iheartradio: { label: 'iHeartRadio', accent: '#C6002B' },
  tiktok: { label: 'TikTok', accent: '#000000' },
};

export const PRIMARY_PROVIDER_KEYS: ProviderKey[] = [
  'spotify',
  'apple_music',
  'youtube',
  'soundcloud',
];

export const DEFAULT_RELEASE_TEMPLATES: ReleaseTemplate[] = [
  {
    id: 'neon-skyline',
    title: 'Neon Skyline',
    releaseDate: '2024-11-12',
    artworkUrl:
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=640&q=80',
    providers: {
      spotify: 'https://open.spotify.com/track/6zSpb8dQRaw0M1dK8PBwQz',
      apple_music:
        'https://music.apple.com/us/album/neon-skyline/1492291454?i=1492291455',
      youtube: 'https://music.youtube.com/watch?v=HhjHYkPQ8F0',
      soundcloud: 'https://soundcloud.com/afrojack/neon-skyline',
      deezer: 'https://www.deezer.com/track/864163182',
    },
  },
  {
    id: 'midnight-parade',
    title: 'Midnight Parade',
    releaseDate: '2026-01-26',
    artworkUrl:
      'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=640&q=80',
    providers: {
      spotify: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
      apple_music:
        'https://music.apple.com/us/album/midnight-parade/1690822920?i=1690822921',
      youtube: 'https://music.youtube.com/watch?v=VbfpW0pbvaU',
      soundcloud: 'https://soundcloud.com/odesza/midnight-parade',
      tidal: 'https://tidal.com/browse/track/243887547',
    },
  },
  {
    id: 'stillness',
    title: 'Stillness',
    releaseDate: '2026-02-10',
    artworkUrl:
      'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=640&q=80',
    providers: {
      spotify: 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b',
      apple_music:
        'https://music.apple.com/us/album/stillness/1499825570?i=1499825571',
      youtube: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
      soundcloud: 'https://soundcloud.com/porter-robinson/stillness',
      amazon_music: 'https://music.amazon.com/albums/B083PHSB48',
    },
  },
];
