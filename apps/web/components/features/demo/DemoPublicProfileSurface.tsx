import { buildDemoProfile } from '@/features/demo/mock-dashboard-data';
import { StaticArtistPage } from '@/features/profile/StaticArtistPage';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import type { Artist, LegacySocialLink } from '@/types/db';
import { DemoClientProviders } from './DemoClientProviders';

const DEMO_PUBLIC_PROFILE = buildDemoProfile();
const DEMO_PUBLIC_ARTIST: Artist = {
  id: DEMO_PUBLIC_PROFILE.id,
  owner_user_id: DEMO_PUBLIC_PROFILE.userId ?? 'demo-user-001',
  handle: DEMO_PUBLIC_PROFILE.username,
  spotify_id:
    DEMO_PUBLIC_PROFILE.spotifyId ?? TIM_WHITE_PROFILE.spotifyArtistId,
  name: DEMO_PUBLIC_PROFILE.displayName ?? 'Tim White',
  image_url: DEMO_PUBLIC_PROFILE.avatarUrl ?? undefined,
  tagline: DEMO_PUBLIC_PROFILE.bio ?? undefined,
  theme: DEMO_PUBLIC_PROFILE.theme ?? {},
  settings: DEMO_PUBLIC_PROFILE.settings ?? {},
  spotify_url: DEMO_PUBLIC_PROFILE.spotifyUrl ?? undefined,
  apple_music_url: DEMO_PUBLIC_PROFILE.appleMusicUrl ?? undefined,
  youtube_url: DEMO_PUBLIC_PROFILE.youtubeUrl ?? undefined,
  apple_music_id: DEMO_PUBLIC_PROFILE.appleMusicId ?? undefined,
  youtube_music_id: DEMO_PUBLIC_PROFILE.youtubeMusicId ?? undefined,
  deezer_id: DEMO_PUBLIC_PROFILE.deezerId ?? undefined,
  tidal_id: DEMO_PUBLIC_PROFILE.tidalId ?? undefined,
  soundcloud_id: DEMO_PUBLIC_PROFILE.soundcloudId ?? undefined,
  venmo_handle: DEMO_PUBLIC_PROFILE.venmoHandle ?? undefined,
  location: DEMO_PUBLIC_PROFILE.location ?? null,
  hometown: null,
  active_since_year: DEMO_PUBLIC_PROFILE.activeSinceYear ?? null,
  genres: DEMO_PUBLIC_PROFILE.genres ?? null,
  career_highlights: DEMO_PUBLIC_PROFILE.careerHighlights ?? null,
  target_playlists: DEMO_PUBLIC_PROFILE.targetPlaylists ?? null,
  published: Boolean(DEMO_PUBLIC_PROFILE.isPublic),
  is_verified: Boolean(DEMO_PUBLIC_PROFILE.isVerified),
  is_featured: Boolean(DEMO_PUBLIC_PROFILE.isFeatured),
  marketing_opt_out: Boolean(DEMO_PUBLIC_PROFILE.marketingOptOut),
  created_at: DEMO_PUBLIC_PROFILE.createdAt.toISOString(),
};

const DEMO_PUBLIC_SOCIAL_LINKS: readonly LegacySocialLink[] = [
  {
    id: 'demo-social-spotify',
    artist_id: DEMO_PUBLIC_ARTIST.id,
    platform: 'spotify',
    url: DEMO_PUBLIC_ARTIST.spotify_url ?? TIM_WHITE_PROFILE.spotifyUrl,
    clicks: 1432,
    created_at: DEMO_PUBLIC_ARTIST.created_at,
  },
  {
    id: 'demo-social-instagram',
    artist_id: DEMO_PUBLIC_ARTIST.id,
    platform: 'instagram',
    url: 'https://instagram.com/timwhitemusic',
    clicks: 824,
    created_at: DEMO_PUBLIC_ARTIST.created_at,
  },
  {
    id: 'demo-social-youtube',
    artist_id: DEMO_PUBLIC_ARTIST.id,
    platform: 'youtube',
    url: 'https://youtube.com/@timwhitemusic',
    clicks: 512,
    created_at: DEMO_PUBLIC_ARTIST.created_at,
  },
] as const;

export function DemoPublicProfileSurface() {
  return (
    <DemoClientProviders>
      <div data-testid='demo-showcase-public-profile'>
        <StaticArtistPage
          mode='profile'
          artist={DEMO_PUBLIC_ARTIST}
          socialLinks={[...DEMO_PUBLIC_SOCIAL_LINKS]}
          contacts={[]}
          subtitle='Electronic artist and producer'
          showTipButton
          showBackButton={false}
          showFooter
          showSubscriptionConfirmedBanner={false}
          genres={DEMO_PUBLIC_PROFILE.genres}
        />
      </div>
    </DemoClientProviders>
  );
}
