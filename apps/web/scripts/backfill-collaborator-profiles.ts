#!/usr/bin/env tsx

import { pathToFileURL } from 'node:url';
import { and, eq, gt, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  artists,
  discogReleases,
  releaseArtists,
} from '@/lib/db/schema/content';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { PUBLIC_ARTIST_COLLABORATOR_ROLES } from '@/lib/discography/artist-credit-policy';
import { reconcileCreditedArtistProfiles } from '@/lib/discography/collaborator-profile-reconciliation';
import { publicReleaseEligibilitySqlPredicate } from '@/lib/profile/public-release-eligibility';
import { resolveSpotifyArtistIdentity } from '@/lib/spotify/artist-id';

interface BackfillArgs {
  readonly dryRun: boolean;
  readonly limit: number;
  readonly cursor: string | null;
  readonly profileId: string | null;
}

interface BackfillSummary {
  readonly mode: 'dry-run' | 'write';
  readonly scanned: number;
  readonly resolved: number;
  readonly processed: number;
  readonly missingIdentity: number;
  readonly identityConflicts: number;
  readonly failed: number;
  readonly created: number;
  readonly reused: number;
  readonly conflicted: number;
  readonly metadataUnavailable: number;
  readonly deferredProfiles: number;
  readonly nextCursor: string | null;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const MAX_PROFILE_PASSES = 10;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readUuid(value: string | undefined, flag: string): string {
  if (!value || !UUID_PATTERN.test(value)) {
    throw new Error(`${flag} requires a valid UUID.`);
  }
  return value;
}

export function parseBackfillArgs(argv: readonly string[]): BackfillArgs {
  let dryRun = true;
  let explicitlyDryRun = false;
  let explicitlyApply = false;
  let limit = DEFAULT_LIMIT;
  let cursor: string | null = null;
  let profileId: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === '--') continue;
    if (value === '--dry-run') {
      explicitlyDryRun = true;
      dryRun = true;
      continue;
    }
    if (value === '--apply') {
      explicitlyApply = true;
      dryRun = false;
      continue;
    }
    if (value === '--limit') {
      const parsed = Number.parseInt(argv[index + 1] ?? '', 10);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
        throw new Error(
          `--limit must be an integer between 1 and ${MAX_LIMIT}.`
        );
      }
      limit = parsed;
      index += 1;
      continue;
    }
    if (value === '--cursor') {
      cursor = readUuid(argv[index + 1], '--cursor');
      index += 1;
      continue;
    }
    if (value === '--profile-id') {
      profileId = readUuid(argv[index + 1], '--profile-id');
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${value}`);
  }

  if (explicitlyDryRun && explicitlyApply) {
    throw new Error('Choose either --dry-run or --apply, not both.');
  }
  if (cursor && profileId) {
    throw new Error('--cursor cannot be combined with --profile-id.');
  }

  return { dryRun, limit, cursor, profileId };
}

export async function backfillCollaboratorProfiles({
  dryRun,
  limit,
  cursor,
  profileId,
}: BackfillArgs): Promise<BackfillSummary> {
  const profileConditions = [
    eq(creatorProfiles.isPublic, true),
    inArray(releaseArtists.role, PUBLIC_ARTIST_COLLABORATOR_ROLES),
    isNotNull(artists.spotifyId),
    isNull(artists.creatorProfileId),
    publicReleaseEligibilitySqlPredicate(),
  ];
  if (profileId) profileConditions.push(eq(creatorProfiles.id, profileId));
  else if (cursor) profileConditions.push(gt(creatorProfiles.id, cursor));

  const profiles = await db
    .selectDistinct({
      id: creatorProfiles.id,
      usernameNormalized: creatorProfiles.usernameNormalized,
      spotifyId: creatorProfiles.spotifyId,
      spotifyUrl: creatorProfiles.spotifyUrl,
    })
    .from(creatorProfiles)
    .innerJoin(
      discogReleases,
      eq(discogReleases.creatorProfileId, creatorProfiles.id)
    )
    .innerJoin(releaseArtists, eq(releaseArtists.releaseId, discogReleases.id))
    .innerJoin(artists, eq(artists.id, releaseArtists.artistId))
    .where(and(...profileConditions))
    .orderBy(creatorProfiles.id)
    .limit(profileId ? 1 : limit);

  const profileLinks =
    profiles.length > 0
      ? await db
          .select({
            creatorProfileId: socialLinks.creatorProfileId,
            url: socialLinks.url,
          })
          .from(socialLinks)
          .where(
            and(
              inArray(
                socialLinks.creatorProfileId,
                profiles.map(profile => profile.id)
              ),
              eq(socialLinks.platform, 'spotify'),
              eq(socialLinks.isActive, true),
              eq(socialLinks.state, 'active')
            )
          )
      : [];
  const linksByProfile = new Map<string, string[]>();
  for (const link of profileLinks) {
    const values = linksByProfile.get(link.creatorProfileId) ?? [];
    values.push(link.url);
    linksByProfile.set(link.creatorProfileId, values);
  }

  let resolved = 0;
  let processed = 0;
  let missingIdentity = 0;
  let identityConflicts = 0;
  let failed = 0;
  let created = 0;
  let reused = 0;
  let conflicted = 0;
  let metadataUnavailable = 0;
  let deferredProfiles = 0;

  for (const profile of profiles) {
    const identity = resolveSpotifyArtistIdentity([
      profile.spotifyId,
      profile.spotifyUrl,
      ...(linksByProfile.get(profile.id) ?? []),
    ]);
    if (identity.status === 'missing') {
      missingIdentity += 1;
      continue;
    }
    if (identity.status === 'conflict') {
      identityConflicts += 1;
      continue;
    }
    resolved += 1;
    if (dryRun) continue;

    try {
      let pass = 0;
      let deferred = false;
      do {
        const result = await reconcileCreditedArtistProfiles(
          profile.id,
          identity.spotifyArtistId
        );
        created += result.created;
        reused += result.reused;
        conflicted += result.conflicted;
        metadataUnavailable += result.metadataUnavailable;
        deferred = result.deferred;
        pass += 1;
      } while (deferred && pass < MAX_PROFILE_PASSES);

      if (deferred) deferredProfiles += 1;
      processed += 1;
    } catch (error) {
      failed += 1;
      console.error(
        JSON.stringify({
          event: 'collaborator_profile_backfill_failed',
          profileId: profile.id,
          username: profile.usernameNormalized,
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  return {
    mode: dryRun ? 'dry-run' : 'write',
    scanned: profiles.length,
    resolved,
    processed,
    missingIdentity,
    identityConflicts,
    failed,
    created,
    reused,
    conflicted,
    metadataUnavailable,
    deferredProfiles,
    nextCursor: profileId ? null : (profiles.at(-1)?.id ?? null),
  };
}

async function main() {
  const args = parseBackfillArgs(process.argv.slice(2));
  const summary = await backfillCollaboratorProfiles(args);
  console.log(JSON.stringify(summary, null, 2));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main().catch(error => {
    console.error('Collaborator profile backfill failed:', error);
    process.exit(1);
  });
}
