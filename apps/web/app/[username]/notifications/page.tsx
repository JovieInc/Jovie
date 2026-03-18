import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BASE_URL } from '@/constants/app';
import { getProfileWithLinks } from '@/lib/services/profile';
import { toISOStringSafe } from '@/lib/utils/date';
import { type CreatorProfile, convertCreatorProfileToArtist } from '@/types/db';
import { NotificationsPageClient } from './NotificationsPageClient';

interface Props {
  readonly params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;

  return {
    title: `Get notifications from ${username}`,
    description: `Get notified whenever ${username} releases new music or goes on tour.`,
    alternates: {
      canonical: `${BASE_URL}/${username.toLowerCase()}/notifications`,
    },
  };
}

export default async function NotificationsPage({ params }: Props) {
  const { username } = await params;

  const result = await getProfileWithLinks(username);
  if (!result || !result.isPublic) notFound();

  // Map camelCase ProfileWithLinks → snake_case CreatorProfile for convertCreatorProfileToArtist
  const profile: CreatorProfile = {
    id: result.id,
    user_id: result.userId,
    creator_type: result.creatorType,
    username: result.username,
    display_name: result.displayName,
    bio: result.bio,
    avatar_url: result.avatarUrl,
    spotify_url: result.spotifyUrl,
    apple_music_url: result.appleMusicUrl,
    youtube_url: result.youtubeUrl,
    spotify_id: result.spotifyId,
    apple_music_id: result.appleMusicId ?? null,
    youtube_music_id: result.youtubeMusicId ?? null,
    deezer_id: result.deezerId ?? null,
    tidal_id: result.tidalId ?? null,
    soundcloud_id: result.soundcloudId ?? null,
    is_public: !!result.isPublic,
    is_verified: !!result.isVerified,
    is_claimed: !!result.isClaimed,
    claim_token: null,
    claimed_at: null,
    settings: result.settings,
    theme: result.theme,
    location: result.location ?? null,
    active_since_year: result.activeSinceYear ?? null,
    is_featured: result.isFeatured || false,
    marketing_opt_out: result.marketingOptOut || false,
    profile_views: result.profileViews || 0,
    username_normalized: result.usernameNormalized,
    search_text:
      `${result.displayName || ''} ${result.username} ${result.bio || ''}`
        .toLowerCase()
        .trim(),
    display_title: result.displayName || result.username,
    profile_completion_pct: 0,
    created_at: toISOStringSafe(result.createdAt),
    updated_at: toISOStringSafe(result.updatedAt),
  };

  const artist = convertCreatorProfileToArtist(profile);

  return <NotificationsPageClient artist={artist} />;
}
