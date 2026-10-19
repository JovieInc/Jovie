import 'server-only';

import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getExactProfileAccess } from '@/lib/auth/profile-access';
import { withDbSessionTx } from '@/lib/auth/session';
import { getProfileSocialLinks } from '@/lib/db/queries/shared';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  ARTIST_PROFILE_FIELDS,
  type ArtistProfileField,
} from './artist-profile-contract';
import {
  ARTIST_PROFILE_FIELD_ACCESSORS,
  getArtistProfileWebsiteLinks,
} from './artist-profile-fields';

interface LinkRevision {
  readonly id: string;
  readonly version: number;
}

export type ArtistProfileFieldProvenance =
  | {
      readonly source: 'creator_profiles';
      readonly profileId: string;
      readonly profileEditVersion: number;
      readonly column: 'avatar_url' | 'bio' | 'username_normalized';
      readonly resolver?: 'buildProfileCanonicalUrl';
    }
  | {
      readonly source: 'social_links';
      readonly profileId: string;
      readonly links: readonly LinkRevision[];
    };

export type ArtistProfileFieldValue = {
  readonly provenance: ArtistProfileFieldProvenance;
} & (
  | { readonly status: 'available'; readonly value: string }
  | {
      readonly status: 'unavailable';
      readonly value: null;
      readonly reason: 'missing' | 'ambiguous';
    }
);

export interface ArtistProfileSnapshot {
  readonly profileId: string;
  readonly profileEditVersion: number;
  readonly revision: string;
  readonly fields: Readonly<
    Record<ArtistProfileField, ArtistProfileFieldValue>
  >;
}

export class ArtistProfileSnapshotError extends Error {
  constructor(
    readonly reason:
      | 'invalid'
      | 'not_found'
      | 'forbidden'
      | 'ambiguous'
      | 'stale_revision'
  ) {
    super(`Canonical profile snapshot unavailable: ${reason}`);
    this.name = 'ArtistProfileSnapshotError';
  }
}

/**
 * Load canonical outbound values for the authenticated owner or manager of this
 * exact profile. Inputs are selectors/version preconditions, never field values
 * or destination payloads. A snapshot authorizes no provider write by itself.
 */
export async function getArtistProfileSnapshot(
  profileId: string,
  options: { readonly expectedRevision?: string } = {}
): Promise<ArtistProfileSnapshot> {
  return withDbSessionTx(
    async (tx, appUserId) => {
      const access = await getExactProfileAccess(tx, appUserId, profileId);
      if (!access.ok) throw new ArtistProfileSnapshotError(access.reason);

      const [profile] = await tx
        .select({
          avatar_url: creatorProfiles.avatarUrl,
          bio: creatorProfiles.bio,
          username: creatorProfiles.username,
          username_normalized: creatorProfiles.usernameNormalized,
          profileEditVersion: creatorProfiles.profileEditVersion,
        })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.id, profileId))
        .limit(1);
      if (!profile) throw new ArtistProfileSnapshotError('not_found');

      // No display limit: truncation could hide another website candidate.
      const rows = await getProfileSocialLinks(tx, profileId, { limit: null });
      const socialLinks = rows.map(row => ({
        id: row.id,
        platform: row.platform,
        platform_type: row.platformType ?? '',
        url: row.url,
        sort_order: row.sortOrder ?? 0,
        is_active: row.isActive === true && row.state === 'active',
      }));
      const candidates = getArtistProfileWebsiteLinks(socialLinks);
      const candidateIds = new Set(candidates.map(link => link.id));
      const links = rows
        .filter(row => candidateIds.has(row.id))
        .map(({ id, version }) => ({ id, version }))
        .sort((left, right) =>
          left.id < right.id ? -1 : left.id > right.id ? 1 : 0
        );
      const revision = `artist-profile-v1:${createHash('sha256')
        .update(JSON.stringify([profileId, profile.profileEditVersion, links]))
        .digest('hex')}`;
      if (
        options.expectedRevision !== undefined &&
        options.expectedRevision !== revision
      ) {
        throw new ArtistProfileSnapshotError('stale_revision');
      }

      const profileSource = {
        source: 'creator_profiles' as const,
        profileId,
        profileEditVersion: profile.profileEditVersion,
      };
      const provenance: Record<
        ArtistProfileField,
        ArtistProfileFieldProvenance
      > = {
        bio: { ...profileSource, column: 'bio' },
        bio_link: {
          ...profileSource,
          column: 'username_normalized',
          resolver: 'buildProfileCanonicalUrl',
        },
        image: { ...profileSource, column: 'avatar_url' },
        website: { source: 'social_links', profileId, links },
      };
      const fields = {} as Record<ArtistProfileField, ArtistProfileFieldValue>;
      for (const field of ARTIST_PROFILE_FIELDS) {
        const value = ARTIST_PROFILE_FIELD_ACCESSORS[field]({
          profile,
          socialLinks,
        });
        fields[field] = value?.trim()
          ? { status: 'available', value, provenance: provenance[field] }
          : {
              status: 'unavailable',
              value: null,
              reason:
                field === 'website' && candidates.length > 1
                  ? 'ambiguous'
                  : 'missing',
              provenance: provenance[field],
            };
      }
      return {
        profileId,
        profileEditVersion: profile.profileEditVersion,
        revision,
        fields,
      };
    },
    // Authorization, profile values, and link versions share one MVCC snapshot.
    { isolationLevel: 'repeatable read' }
  );
}
