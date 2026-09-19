/**
 * Canonical release/track artist-credit integrity.
 *
 * Credited primary/main artists are identity data. They must survive
 * source metadata → normalization → canonical model → cache/API → UI
 * without being collapsed to a single display artist or the profile owner.
 */

import type { ArtistRole } from '@/lib/db/schema/content';
import { canonicalizeReleaseArtistHandle } from '@/lib/profile/opaque-internal-profile-handle';
import {
  isPrimaryArtistRole,
  PRIMARY_ARTIST_ROLES,
} from './artist-credit-policy';
import { formatReleaseArtistLine } from './formatting';

export { PRIMARY_ARTIST_ROLES };

export interface ReleaseCreditIdentity {
  readonly artistId?: string | null;
  readonly spotifyId?: string | null;
  readonly appleMusicId?: string | null;
  readonly musicbrainzId?: string | null;
  readonly deezerId?: string | null;
}

export interface CanonicalReleaseCredit extends ReleaseCreditIdentity {
  readonly name: string;
  readonly handle: string | null;
  readonly role: ArtistRole;
  readonly position: number;
  readonly isPrimary: boolean;
}

export interface ProviderPrimaryArtist {
  readonly provider: string;
  readonly id?: string | null;
  readonly name: string;
}

export interface CreditProviderMismatch {
  readonly provider: string;
  readonly storedNames: readonly string[];
  readonly providerNames: readonly string[];
  readonly addedNames: readonly string[];
  readonly skippedFeaturedNames: readonly string[];
}

export interface ReconciledPrimaryCredits {
  readonly primaryArtists: CanonicalReleaseCredit[];
  readonly mismatch: CreditProviderMismatch | null;
}

export interface SmartLinkArtistByline {
  readonly entries: ReadonlyArray<{
    readonly name: string;
    readonly handle: string | null;
  }>;
  readonly text: string;
}

export const WHEELS_UP_MULTI_PRIMARY_FIXTURE = {
  title: 'Wheels Up',
  sourceArtists: [
    { id: 'spotify-tim-white', name: 'Tim White' },
    { id: 'spotify-lynx', name: 'LYNX' },
  ],
} as const;

function providerIdentityKey(
  provider: string,
  id: string | null | undefined
): string | null {
  const trimmed = id?.trim();
  if (!trimmed) return null;
  return `provider:${provider}:${trimmed}`;
}

export function creditIdentityKeys(
  credit: ReleaseCreditIdentity
): readonly string[] {
  const keys: string[] = [];
  if (credit.artistId?.trim()) {
    keys.push(`artist:${credit.artistId.trim()}`);
  }
  if (credit.spotifyId?.trim()) {
    keys.push(`provider:spotify:${credit.spotifyId.trim()}`);
  }
  if (credit.appleMusicId?.trim()) {
    keys.push(`provider:apple_music:${credit.appleMusicId.trim()}`);
  }
  if (credit.musicbrainzId?.trim()) {
    keys.push(`provider:musicbrainz:${credit.musicbrainzId.trim()}`);
  }
  if (credit.deezerId?.trim()) {
    keys.push(`provider:deezer:${credit.deezerId.trim()}`);
  }
  return keys;
}

export function creditsResolveToSameArtist(
  left: ReleaseCreditIdentity,
  right: ReleaseCreditIdentity
): boolean {
  const rightKeys = new Set(creditIdentityKeys(right));
  return creditIdentityKeys(left).some(key => rightKeys.has(key));
}

export function dedupeCanonicalCredits<T extends ReleaseCreditIdentity>(
  credits: readonly T[]
): T[] {
  const kept: T[] = [];
  for (const credit of credits) {
    const alreadyKept = kept.some(existing =>
      creditsResolveToSameArtist(existing, credit)
    );
    if (alreadyKept) continue;
    kept.push(credit);
  }
  return kept;
}

export function selectPrimaryArtistCredits<T extends CanonicalReleaseCredit>(
  credits: readonly T[]
): T[] {
  const primaries = credits.filter(
    credit =>
      credit.role === 'main_artist' ||
      (credit.isPrimary && isPrimaryArtistRole(credit.role))
  );

  return dedupeCanonicalCredits(
    [...primaries].sort((left, right) => left.position - right.position)
  );
}

export function parseProviderAlbumArtists(
  metadata: Record<string, unknown> | null | undefined
): ProviderPrimaryArtist[] {
  if (!metadata) return [];

  const raw = metadata.spotifyArtists;
  if (!Array.isArray(raw)) return [];

  const artists: ProviderPrimaryArtist[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!name) continue;
    artists.push({
      provider: 'spotify',
      id: typeof record.id === 'string' ? record.id : null,
      name,
    });
  }
  return artists;
}

function creditMatchesProviderById(
  credit: CanonicalReleaseCredit,
  providerArtist: ProviderPrimaryArtist
): boolean {
  const providerKey = providerIdentityKey(
    providerArtist.provider,
    providerArtist.id
  );
  return providerKey ? creditIdentityKeys(credit).includes(providerKey) : false;
}

export function reconcilePrimaryArtists(input: {
  readonly storedCredits: readonly CanonicalReleaseCredit[];
  readonly providerArtists?: readonly ProviderPrimaryArtist[];
}): ReconciledPrimaryCredits {
  const storedPrimaries = selectPrimaryArtistCredits(input.storedCredits);
  const storedNonPrimaries = input.storedCredits.filter(
    credit => !storedPrimaries.includes(credit)
  );
  const providerArtists = input.providerArtists ?? [];

  if (providerArtists.length === 0) {
    return { primaryArtists: storedPrimaries, mismatch: null };
  }

  const added: CanonicalReleaseCredit[] = [];
  const skippedFeaturedNames: string[] = [];
  let nextPosition =
    storedPrimaries.reduce(
      (max, credit) => Math.max(max, credit.position),
      -1
    ) + 1;

  for (const providerArtist of providerArtists) {
    if (
      storedPrimaries.some(credit =>
        creditMatchesProviderById(credit, providerArtist)
      )
    ) {
      continue;
    }

    if (
      storedNonPrimaries.some(credit =>
        creditMatchesProviderById(credit, providerArtist)
      )
    ) {
      skippedFeaturedNames.push(providerArtist.name);
      continue;
    }

    if (storedPrimaries.some(credit => credit.name === providerArtist.name)) {
      continue;
    }

    added.push({
      artistId: null,
      spotifyId:
        providerArtist.provider === 'spotify' ? providerArtist.id : null,
      appleMusicId:
        providerArtist.provider === 'apple_music' ? providerArtist.id : null,
      musicbrainzId:
        providerArtist.provider === 'musicbrainz' ? providerArtist.id : null,
      deezerId: providerArtist.provider === 'deezer' ? providerArtist.id : null,
      name: providerArtist.name,
      handle: null,
      role: 'main_artist',
      position: nextPosition++,
      isPrimary: true,
    });
  }

  const providerNames = providerArtists.map(artist => artist.name);
  const storedNames = storedPrimaries.map(credit => credit.name);
  const storedNameSet = new Set(storedNames);
  const providerNameSet = new Set(providerNames);
  const setsDiffer =
    added.length > 0 ||
    skippedFeaturedNames.length > 0 ||
    providerNames.some(name => !storedNameSet.has(name)) ||
    storedNames.some(name => !providerNameSet.has(name));

  return {
    primaryArtists: [...storedPrimaries, ...added],
    mismatch:
      setsDiffer && providerArtists.length > 0
        ? {
            provider: providerArtists[0]?.provider ?? 'unknown',
            storedNames,
            providerNames,
            addedNames: added.map(credit => credit.name),
            skippedFeaturedNames,
          }
        : null,
  };
}

export function serializePrimaryArtists(
  credits: readonly CanonicalReleaseCredit[]
): CanonicalReleaseCredit[] {
  return credits.map(credit => ({
    artistId: credit.artistId ?? null,
    spotifyId: credit.spotifyId ?? null,
    appleMusicId: credit.appleMusicId ?? null,
    musicbrainzId: credit.musicbrainzId ?? null,
    deezerId: credit.deezerId ?? null,
    name: credit.name,
    handle: credit.handle,
    role: credit.role,
    position: credit.position,
    isPrimary: credit.isPrimary,
  }));
}

export function materializeReleaseCreditPayload(input: {
  readonly storedCredits: readonly CanonicalReleaseCredit[];
  readonly providerArtists?: readonly ProviderPrimaryArtist[];
}): ReconciledPrimaryCredits {
  const reconciled = reconcilePrimaryArtists(input);
  return {
    primaryArtists: serializePrimaryArtists(reconciled.primaryArtists),
    mismatch: reconciled.mismatch,
  };
}

export function resolveSmartLinkArtistByline(input: {
  readonly primaryArtists?: ReadonlyArray<{
    readonly name: string;
    readonly handle: string | null;
  }>;
  readonly ownerName: string;
  readonly ownerHandle: string | null;
}): SmartLinkArtistByline {
  const entries =
    input.primaryArtists && input.primaryArtists.length > 0
      ? input.primaryArtists.map(artist => ({
          name: artist.name,
          handle: canonicalizeReleaseArtistHandle({
            handle: artist.handle,
            name: artist.name,
            ownerHandle: input.ownerHandle,
            ownerName: input.ownerName,
          }),
        }))
      : [{ name: input.ownerName, handle: input.ownerHandle }];

  return {
    entries,
    text:
      formatReleaseArtistLine(
        entries.map(artist => artist.name),
        input.ownerName
      ) ?? input.ownerName,
  };
}

export function collectOrderedPrimaryNames(
  rows: ReadonlyArray<{
    readonly artistId: string;
    readonly name: string;
    readonly role: ArtistRole;
  }>
): string[] {
  const primaries = rows.filter(row => isPrimaryArtistRole(row.role));
  const names: string[] = [];
  const seenArtistIds = new Set<string>();

  for (const row of primaries) {
    if (seenArtistIds.has(row.artistId)) continue;
    seenArtistIds.add(row.artistId);
    const name = row.name.trim();
    if (name) names.push(name);
  }

  return names;
}
