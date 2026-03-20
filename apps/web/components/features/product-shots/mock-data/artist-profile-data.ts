import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';

export const MOCK_ARTIST: Artist = {
  id: 'mock-artist-001',
  owner_user_id: 'mock-user-001',
  handle: 'timwhite',
  spotify_id: '4iV5W9uYEdYUVa79Axb7Rh',
  name: 'Tim White',
  image_url:
    'https://egojgbuon2z2yahy.public.blob.vercel-storage.com/avatars/users/user_38SPgR24re2YSaXT2hVoFtvvlVy/tim-white-profie-pic-e2f4672b-3555-4a63-9fe6-f0d5362218f6.avif',
  tagline: 'Producer & Artist',
  theme: {},
  settings: {},
  spotify_url: 'https://open.spotify.com/artist/4iV5W9uYEdYUVa79Axb7Rh',
  apple_music_url: 'https://music.apple.com/us/artist/tim-white/1234567890',
  youtube_url: 'https://youtube.com/@timwhite',
  location: 'Los Angeles, CA',
  genres: ['Electronic', 'Dance'],
  published: true,
  is_verified: true,
  is_featured: true,
  marketing_opt_out: false,
  created_at: new Date().toISOString(),
};

export const MOCK_SOCIAL_LINKS: LegacySocialLink[] = [
  {
    id: 'mock-social-001',
    artist_id: 'mock-artist-001',
    platform: 'spotify',
    url: 'https://open.spotify.com/artist/4iV5W9uYEdYUVa79Axb7Rh',
    clicks: 0,
    created_at: new Date().toISOString(),
  },
  {
    id: 'mock-social-002',
    artist_id: 'mock-artist-001',
    platform: 'apple_music',
    url: 'https://music.apple.com/us/artist/tim-white/1234567890',
    clicks: 0,
    created_at: new Date().toISOString(),
  },
  {
    id: 'mock-social-003',
    artist_id: 'mock-artist-001',
    platform: 'instagram',
    url: 'https://instagram.com/timwhite',
    clicks: 0,
    created_at: new Date().toISOString(),
  },
];

export const MOCK_CONTACTS: PublicContact[] = [];
