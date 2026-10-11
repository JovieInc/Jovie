import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BASE_URL } from '@/constants/app';
import { AboutView } from '@/features/profile/views/AboutView';
import { buildViewMetadata } from '@/features/profile/views/metadata';
import { ProfileIntentPage } from '@/features/profile/views/ProfileIntentPage';
import { toPublicContacts } from '@/lib/contacts/mapper';
import {
  getCreditedArtistsWithProfiles,
  getStructuredReleaseCollaborators,
} from '@/lib/discography/artist-queries';
import { getReleasesForProfileLite } from '@/lib/discography/queries';
import { buildStructuredCollaboratorParagraph } from '@/lib/profile/aeo-content';
import {
  type EntityMentionContext,
  linkEntityMentions,
} from '@/lib/profile/entity-mentions';
import { resolveSpotifyArtistIdentity } from '@/lib/spotify/artist-id';
import { logger } from '@/lib/utils/logger';
import { convertCreatorProfileToArtist } from '@/types/db';
import { getProfileAndLinks } from '../_lib/public-profile-loader';

export const dynamic = 'force-dynamic';

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const result = await getProfileAndLinks(username);

  // Don't fabricate metadata for missing profiles — let notFound take over
  // in the default page handler.
  if (result.status !== 'ok' || !result.profile) {
    return {};
  }

  const artist = convertCreatorProfileToArtist(result.profile);
  return buildViewMetadata('about', {
    artistName: artist.name,
    artistHandle: artist.handle,
    baseUrl: BASE_URL,
  });
}

export default async function AboutPage({ params }: Props) {
  const { username } = await params;
  const result = await getProfileAndLinks(username);

  if (result.status !== 'ok' || !result.profile) {
    notFound();
  }

  const artist = convertCreatorProfileToArtist(result.profile);
  const profile = result.profile;
  const profileSettings =
    (profile.settings as Record<string, unknown> | null) ?? {};
  const allowPhotoDownloads =
    profileSettings.allowProfilePhotoDownloads === true;

  // Selected credits: exact structured release-credit edges only, resolved
  // against the owner's exact Spotify identity (same gate as the profile root).
  const creditSegments = await (async () => {
    try {
      const ownerSpotifyIdentity = resolveSpotifyArtistIdentity([
        profile.spotify_id,
        profile.spotify_url,
        ...result.links
          .filter(link => link.platform === 'spotify')
          .map(link => link.url),
      ]);
      if (!ownerSpotifyIdentity.spotifyArtistId) return undefined;
      const collaborators = await getStructuredReleaseCollaborators(
        profile.id,
        { ownerSpotifyId: ownerSpotifyIdentity.spotifyArtistId }
      );
      return (
        buildStructuredCollaboratorParagraph(
          artist.name,
          artist.handle,
          collaborators
        )?.segments ?? undefined
      );
    } catch (error) {
      logger.error(
        'Error building about selected-credits segments',
        { error, profileId: profile.id, route: '/[username]/about' },
        'public-profile'
      );
      return undefined;
    }
  })();

  const contacts = toPublicContacts(result.contacts, artist.name);

  // Entity-linked bio: resolve this profile's own releases + credited artists
  // with public Jovie profiles, then link mentions in the tagline. Failures
  // degrade to plain text.
  const bioSegments = await (async () => {
    const tagline = artist.tagline?.trim();
    if (!tagline) return undefined;
    try {
      const [releases, creditedArtists] = await Promise.all([
        getReleasesForProfileLite(profile.id),
        getCreditedArtistsWithProfiles(profile.id),
      ]);
      const context: EntityMentionContext = {
        ownHandle: artist.handle,
        releases: releases.map(release => ({
          title: release.title,
          slug: release.slug,
        })),
        artists: creditedArtists,
      };
      return linkEntityMentions(tagline, context);
    } catch (error) {
      logger.error(
        'Error building entity-linked bio segments',
        { error, profileId: profile.id, route: '/[username]/about' },
        'public-profile'
      );
      return undefined;
    }
  })();

  return (
    <ProfileIntentPage
      mode='about'
      artistName={artist.name}
      artistHandle={artist.handle}
    >
      <AboutView
        artist={artist}
        genres={result.genres}
        pressPhotos={[...result.pressPhotos]}
        allowPhotoDownloads={allowPhotoDownloads}
        bioSegments={bioSegments}
        creditSegments={creditSegments}
        contacts={contacts}
      />
    </ProfileIntentPage>
  );
}
