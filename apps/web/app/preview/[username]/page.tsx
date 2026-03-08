import { type Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { toPublicContacts } from '@/lib/contacts/mapper';
// eslint-disable-next-line no-restricted-imports -- Schema barrel import needed for types
import type { CreatorContact as DbCreatorContact } from '@/lib/db/schema';
import { calculateRequiredProfileCompletion } from '@/lib/profile/completion';
import { getProfileWithLinks as getCreatorProfileWithLinks } from '@/lib/services/profile';
import { isDspPlatform } from '@/lib/services/social-links/types';
import { toISOStringSafe } from '@/lib/utils/date';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@/lib/validation/username-core';
import {
  CreatorProfile,
  convertCreatorProfileToArtist,
  LegacySocialLink,
} from '@/types/db';
import { ProfileV2Client } from './ProfileV2Client';

function calculateProfileCompletion(result: {
  displayName?: string | null;
  avatarUrl?: string | null;
  userEmail?: string | null;
  spotifyUrl?: string | null;
  appleMusicUrl?: string | null;
  youtubeUrl?: string | null;
  socialLinks?: Array<{
    platform?: string | null;
    platformType?: string | null;
  }> | null;
}): number {
  const hasMusicLinks =
    Boolean(result.spotifyUrl || result.appleMusicUrl || result.youtubeUrl) ||
    Boolean(
      result.socialLinks?.some(link => {
        const platform = link.platform?.toLowerCase();
        return (
          link.platformType === 'dsp' ||
          (typeof platform === 'string' && isDspPlatform(platform))
        );
      })
    );

  return calculateRequiredProfileCompletion({
    displayName: result.displayName,
    avatarUrl: result.avatarUrl,
    email: result.userEmail,
    hasMusicLinks,
  }).percentage;
}

const fetchProfileData = cache(async (username: string) => {
  const result = await getCreatorProfileWithLinks(username.toLowerCase());

  if (!result || !result.isPublic) return null;

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
    profile_completion_pct: calculateProfileCompletion(result),
    created_at: toISOStringSafe(result.createdAt),
    updated_at: toISOStringSafe(result.updatedAt),
  };

  const links: LegacySocialLink[] =
    result.socialLinks?.map(link => ({
      id: link.id,
      artist_id: result.id,
      platform: link.platform.toLowerCase(),
      url: link.url,
      clicks: link.clicks || 0,
      created_at: toISOStringSafe(link.createdAt),
    })) ?? [];

  const hasVenmoSocialLink = links.some(l => l.platform === 'venmo');
  if (!hasVenmoSocialLink && result.venmoHandle) {
    const handle = result.venmoHandle.replace(/^@/, '');
    links.push({
      id: `venmo-${result.id}`,
      artist_id: result.id,
      platform: 'venmo',
      url: `https://venmo.com/${encodeURIComponent(handle)}`,
      clicks: 0,
      created_at: toISOStringSafe(result.createdAt),
    });
  }

  const contacts: DbCreatorContact[] = result.contacts ?? [];

  return {
    profile,
    links,
    contacts,
    genres: result.genres ?? null,
    latestRelease: result.latestRelease ?? null,
    creatorIsPro: Boolean(result.userIsPro),
  };
});

interface Props {
  readonly params: Promise<{ readonly username: string }>;
}

export default async function ProfileV2Page({ params }: Readonly<Props>) {
  const { username } = await params;

  if (
    username.length < USERNAME_MIN_LENGTH ||
    username.length > USERNAME_MAX_LENGTH ||
    !USERNAME_PATTERN.test(username)
  ) {
    notFound();
  }

  const data = await fetchProfileData(username);
  if (!data) notFound();

  const { profile, links, contacts, genres, latestRelease } = data;
  const artist = convertCreatorProfileToArtist(profile);
  const publicContacts = toPublicContacts(contacts, artist.name);

  return (
    <ProfileV2Client
      artist={artist}
      socialLinks={links}
      contacts={publicContacts}
      genres={genres}
      latestRelease={latestRelease}
    />
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const data = await fetchProfileData(username);

  if (!data) {
    return { title: 'Profile Not Found' };
  }

  const name = data.profile.display_name || data.profile.username;
  return {
    title: `${name} — Profile V2 Preview`,
    robots: { index: false, follow: false },
  };
}
