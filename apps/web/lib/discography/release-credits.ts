/**
 * Canonical release/track artist-credit integrity.
 *
 * Credited primary/main artists are identity data. They must survive
 * source metadata → normalization → canonical model → cache/API → UI
 * without being collapsed to a single display artist or the profile owner.
 */

import type { ArtistRole } from '@/lib/db/schema/content';
import { canonicalizeReleaseArtistHandle } from '@/lib/profile/opaque-internal-profile-handle';
import { isPrimaryArtistRole } from './artist-credit-policy';
import { formatReleaseArtistLine } from './formatting';

export { PRIMARY_ARTIST_ROLES } from './artist-credit-policy';

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
  readonly sourceType?: string | null;
  readonly metadata?: Record<string, unknown> | null;
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

export interface CanonicalContributorPayload extends ReconciledPrimaryCredits {
  readonly credits: CanonicalReleaseCredit[];
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

export const TAKE_ME_OVER_ROLE_COMPLETE_FIXTURE = {
  title: 'Take Me Over (feat. Erica Gibson) [Austin Leeds Remix]',
  artistLine: 'Tim White & Austin Leeds',
  expected: [
    { name: 'Tim White', role: 'main_artist' },
    { name: 'Erica Gibson', role: 'featured_artist' },
    { name: 'Austin Leeds', role: 'remixer' },
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

function canMatchProviderByName(
  credit: CanonicalReleaseCredit,
  providerArtist: ProviderPrimaryArtist
): boolean {
  if (!providerIdentityKey(providerArtist.provider, providerArtist.id)) {
    return true;
  }
  const providerPrefix = `provider:${providerArtist.provider}:`;
  return !creditIdentityKeys(credit).some(key =>
    key.startsWith(providerPrefix)
  );
}

const CREDIT_FRAGMENT_JOINS = [' and ', ' & ', ' x '] as const;
const CREDIT_MISMATCH_WARN_TTL_MS = 60 * 60 * 1000;
const CREDIT_MISMATCH_WARN_MAX = 500;
const warnedCreditMismatches = new Map<string, number>();

function comparableCreditName(name: string): string {
  return name.trim().toLowerCase().replaceAll(/\s+/g, ' ');
}

function namesEquivalent(left: string, right: string): boolean {
  return comparableCreditName(left) === comparableCreditName(right);
}

/**
 * Find consecutive stored credits that were split out of one provider artist.
 * "Tones" + "I" rejoins to "Tones And I"; unrelated neighbors do not.
 */
function findSplitFragmentSpan(
  credits: readonly CanonicalReleaseCredit[],
  claimed: readonly boolean[],
  providerName: string
): { start: number; end: number } | null {
  const target = comparableCreditName(providerName);
  if (!target) return null;

  for (let start = 0; start < credits.length; start += 1) {
    if (claimed[start]) continue;
    const parts = [credits[start]?.name ?? ''];
    for (let end = start + 1; end < credits.length; end += 1) {
      if (claimed[end]) break;
      parts.push(credits[end]?.name ?? '');
      const matched = CREDIT_FRAGMENT_JOINS.some(
        join => comparableCreditName(parts.join(join)) === target
      );
      if (matched) return { start, end: end + 1 };
      if (comparableCreditName(parts.join(' & ')).length > target.length) {
        break;
      }
    }
  }

  return null;
}

function repairedProviderCredit(
  head: CanonicalReleaseCredit,
  provider: ProviderPrimaryArtist
): CanonicalReleaseCredit {
  return {
    ...head,
    artistId: null,
    handle: null,
    name: provider.name,
    role: 'main_artist',
    isPrimary: true,
    spotifyId: provider.provider === 'spotify' ? (provider.id ?? null) : null,
    appleMusicId:
      provider.provider === 'apple_music' ? (provider.id ?? null) : null,
    musicbrainzId:
      provider.provider === 'musicbrainz' ? (provider.id ?? null) : null,
    deezerId: provider.provider === 'deezer' ? (provider.id ?? null) : null,
  };
}

/**
 * Collapse stored credits that are split variants of a provider artist name.
 * Already-correct names stay put. Fragments that do not rejoin a provider
 * name are left alone so a real mismatch can still be reported.
 */
export function repairSplitProviderCredits(
  storedPrimaries: readonly CanonicalReleaseCredit[],
  providerArtists: readonly ProviderPrimaryArtist[]
): CanonicalReleaseCredit[] {
  if (providerArtists.length === 0 || storedPrimaries.length === 0) {
    return [...storedPrimaries];
  }

  const claimed = storedPrimaries.map(() => false);
  for (const provider of providerArtists) {
    const exact = storedPrimaries.findIndex(
      (credit, index) =>
        !claimed[index] && namesEquivalent(credit.name, provider.name)
    );
    if (exact >= 0) claimed[exact] = true;
  }

  const skip = new Set<number>();
  const replacements = new Map<number, CanonicalReleaseCredit>();
  for (const provider of providerArtists) {
    const alreadyMatched = storedPrimaries.some(
      (credit, index) =>
        claimed[index] &&
        !replacements.has(index) &&
        !skip.has(index) &&
        namesEquivalent(credit.name, provider.name)
    );
    if (alreadyMatched) continue;

    const span = findSplitFragmentSpan(storedPrimaries, claimed, provider.name);
    if (!span) continue;
    for (let index = span.start; index < span.end; index += 1) {
      claimed[index] = true;
      if (index !== span.start) skip.add(index);
    }
    const head = storedPrimaries[span.start];
    if (!head) continue;
    replacements.set(span.start, repairedProviderCredit(head, provider));
  }

  const repaired: CanonicalReleaseCredit[] = [];
  storedPrimaries.forEach((credit, index) => {
    if (skip.has(index)) return;
    repaired.push(replacements.get(index) ?? credit);
  });
  return repaired;
}

export function creditProviderMismatchWarningKey(input: {
  readonly entityType: string;
  readonly entityId: string;
  readonly mismatch: CreditProviderMismatch;
}): string {
  return [
    input.entityType,
    input.entityId,
    input.mismatch.provider,
    input.mismatch.storedNames.join('\u0000'),
    input.mismatch.providerNames.join('\u0000'),
  ].join('|');
}

/** One warning per entity mismatch per warm instance, not once per render. */
export function shouldReportCreditProviderMismatch(
  key: string,
  now = Date.now()
): boolean {
  const previous = warnedCreditMismatches.get(key);
  if (previous !== undefined && now - previous < CREDIT_MISMATCH_WARN_TTL_MS) {
    return false;
  }

  warnedCreditMismatches.delete(key);
  warnedCreditMismatches.set(key, now);
  while (warnedCreditMismatches.size > CREDIT_MISMATCH_WARN_MAX) {
    const oldest = warnedCreditMismatches.keys().next().value;
    if (oldest === undefined) break;
    warnedCreditMismatches.delete(oldest);
  }
  return true;
}

export function resetCreditProviderMismatchWarnings(): void {
  warnedCreditMismatches.clear();
}

export function reconcilePrimaryArtists(input: {
  readonly storedCredits: readonly CanonicalReleaseCredit[];
  readonly providerArtists?: readonly ProviderPrimaryArtist[];
}): ReconciledPrimaryCredits {
  const providerArtists = input.providerArtists ?? [];
  const originalPrimaries = selectPrimaryArtistCredits(input.storedCredits);
  const storedPrimaries = repairSplitProviderCredits(
    originalPrimaries,
    providerArtists
  );
  const storedNonPrimaries = input.storedCredits.filter(
    credit => !originalPrimaries.includes(credit)
  );

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

    if (
      storedPrimaries.some(
        credit =>
          canMatchProviderByName(credit, providerArtist) &&
          namesEquivalent(credit.name, providerArtist.name)
      )
    ) {
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
  const storedNameSet = new Set(storedNames.map(comparableCreditName));
  const providerNameSet = new Set(providerNames.map(comparableCreditName));
  const setsDiffer =
    added.length > 0 ||
    skippedFeaturedNames.length > 0 ||
    providerNames.some(
      name => !storedNameSet.has(comparableCreditName(name))
    ) ||
    storedNames.some(name => !providerNameSet.has(comparableCreditName(name)));

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

export function serializeContributorCredits(
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
    sourceType: credit.sourceType ?? null,
    metadata: credit.metadata ?? null,
  }));
}

export const serializePrimaryArtists = serializeContributorCredits;

export function dedupeCanonicalContributorCredits(
  credits: readonly CanonicalReleaseCredit[]
): CanonicalReleaseCredit[] {
  const kept: CanonicalReleaseCredit[] = [];
  for (const credit of credits) {
    const duplicate = kept.some(
      existing =>
        existing.role === credit.role &&
        creditsResolveToSameArtist(existing, credit)
    );
    if (!duplicate) kept.push(credit);
  }
  return kept;
}

export function materializeContributorCreditPayload(input: {
  readonly storedCredits: readonly CanonicalReleaseCredit[];
  readonly providerArtists?: readonly ProviderPrimaryArtist[];
}): CanonicalContributorPayload {
  const credits = serializeContributorCredits(
    dedupeCanonicalContributorCredits(
      [...input.storedCredits].sort(
        (left, right) => left.position - right.position
      )
    )
  );
  const reconciled = reconcilePrimaryArtists({
    storedCredits: credits,
    providerArtists: input.providerArtists,
  });
  const nonPrimaryCredits = credits.filter(
    credit => !isPrimaryArtistRole(credit.role)
  );

  return {
    credits: [...reconciled.primaryArtists, ...nonPrimaryCredits],
    primaryArtists: serializeContributorCredits(reconciled.primaryArtists),
    mismatch: reconciled.mismatch,
  };
}

export function materializeReleaseCreditPayload(input: {
  readonly storedCredits: readonly CanonicalReleaseCredit[];
  readonly providerArtists?: readonly ProviderPrimaryArtist[];
}): ReconciledPrimaryCredits {
  const reconciled = materializeContributorCreditPayload(input);
  return {
    primaryArtists: reconciled.primaryArtists,
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
