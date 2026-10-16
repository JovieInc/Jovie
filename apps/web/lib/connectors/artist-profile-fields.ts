import { buildProfileCanonicalUrl } from '@/lib/profile/metadata';
import type { CreatorProfile, SocialLink } from '@/types/db';
import type { ArtistProfileField } from './artist-profile-contract';

interface ProfileSources {
  readonly profile: Pick<CreatorProfile, 'avatar_url' | 'bio' | 'username'> &
    Partial<Pick<CreatorProfile, 'username_normalized'>>;
  /** Existing profile-loader links, already scoped to this creator. */
  readonly socialLinks: readonly Pick<
    SocialLink,
    | 'id'
    | 'platform'
    | 'platform_type'
    | 'url'
    | 'sort_order'
    | 'is_active'
    | 'state'
  >[];
}

export function getArtistProfileWebsiteLinks(
  socialLinks: ProfileSources['socialLinks']
) {
  return socialLinks.filter(
    link =>
      link.is_active &&
      (link.state === undefined || link.state === 'active') &&
      (link.platform === 'website' || link.platform_type === 'website')
  );
}

/** Accessors only: outbound destination values never become new profile columns. */
export const ARTIST_PROFILE_FIELD_ACCESSORS = {
  bio: ({ profile }) => profile.bio,
  bio_link: ({ profile }) =>
    (profile.username_normalized ?? profile.username).trim()
      ? buildProfileCanonicalUrl(profile)
      : null,
  image: ({ profile }) => profile.avatar_url,
  website: ({ socialLinks }) => {
    const candidates = getArtistProfileWebsiteLinks(socialLinks);
    return candidates.length === 1 ? candidates[0].url : null;
  },
} satisfies Record<
  ArtistProfileField,
  (sources: ProfileSources) => string | null
>;
