import type { ProfileWithLinks } from '@/lib/services/profile';
import { toISOStringSafe } from '@/lib/utils/date';
import type { CreatorProfile } from '@/types/db';

/**
 * Maps the public profile query shape (`ProfileWithLinks`) into the legacy
 * `CreatorProfile` contract consumed by profile components.
 *
 * Shared between the main profile page and the notifications page to avoid
 * duplicate mapping logic diverging over time.
 */
export function mapProfileWithLinksToCreatorProfile(
  result: ProfileWithLinks,
  options?: { profileCompletionPct?: number }
): CreatorProfile {
  return {
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
    profile_completion_pct: options?.profileCompletionPct ?? 0,
    created_at: toISOStringSafe(result.createdAt),
    updated_at: toISOStringSafe(result.updatedAt),
  };
}
