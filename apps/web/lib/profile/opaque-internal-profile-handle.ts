/**
 * Opaque internal-ID public profile handles.
 *
 * JOV-6201: release pages linked artist names to machine-minted IDs like
 * `/tmoc9mm7xfvx02c` (Tim dogfood: /tim/never-say-a-word). Those URLs render
 * junk duplicate profiles. Public artist destinations must be a canonical
 * human handle, or the name stays unlinked. Visiting an opaque ID URL must
 * redirect to the canonical handle or 404.
 *
 * Shape matches JOV-6126 QA machine handles. Unclaimed collaborator
 * `a_{uuid36}` profiles are a separate, intentional public identity and are
 * not treated as junk destinations here — except when that encoded handle is
 * attached to the page owner, in which case the owner's claimed handle wins.
 */

export const QA_MACHINE_HANDLE_PATTERN = /^tmoc[0-9a-z]{10,}$/;
const ENCODED_UNCLAIMED_ARTIST_HANDLE_PATTERN = /^a_[0-9a-z]{25}$/;

export const NEVER_SAY_A_WORD_OPAQUE_PROFILE_FIXTURE = {
  releasePath: '/tim/never-say-a-word',
  releaseSlug: 'never-say-a-word',
  ownerName: 'Tim White',
  ownerHandle: 'tim',
  artistName: 'Tim White',
  opaqueHandle: 'tmoc9mm7xfvx02c',
  opaqueProfilePath: '/tmoc9mm7xfvx02c',
} as const;

export type OpaqueInternalProfileDecision =
  | { readonly action: 'serve' }
  | { readonly action: 'redirect'; readonly handle: string }
  | { readonly action: 'not_found' };

export function normalizePublicProfileHandle(
  handle: string | null | undefined
): string {
  return handle?.trim().toLowerCase() ?? '';
}

export function isOpaqueInternalProfileHandle(
  handle: string | null | undefined
): boolean {
  return QA_MACHINE_HANDLE_PATTERN.test(normalizePublicProfileHandle(handle));
}

export function isEncodedUnclaimedArtistHandle(
  handle: string | null | undefined
): boolean {
  return ENCODED_UNCLAIMED_ARTIST_HANDLE_PATTERN.test(
    normalizePublicProfileHandle(handle)
  );
}

export function isCanonicalPublicProfileHandle(
  handle: string | null | undefined
): boolean {
  const normalized = normalizePublicProfileHandle(handle);
  return (
    normalized.length > 0 &&
    !isOpaqueInternalProfileHandle(normalized) &&
    !isEncodedUnclaimedArtistHandle(normalized)
  );
}

function namesMatch(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * Public href handle for a release-page artist name.
 *
 * Opaque internal IDs never become `/${handle}` destinations. When the credit
 * is the page owner, use the owner's canonical handle. Other opaque credits
 * stay unlinked so we do not mint junk profile traffic.
 */
export function canonicalizeReleaseArtistHandle(input: {
  readonly handle: string | null;
  readonly name: string;
  readonly ownerHandle: string | null;
  readonly ownerName: string;
}): string | null {
  const handle = input.handle?.trim() ?? '';
  const ownerHandle = input.ownerHandle?.trim() || null;
  const ownerIsCanonical = isCanonicalPublicProfileHandle(ownerHandle);
  const isOwnerCredit = namesMatch(input.name, input.ownerName);

  if (isOwnerCredit && ownerHandle && ownerIsCanonical) {
    return ownerHandle;
  }

  if (!handle) return null;
  if (isOpaqueInternalProfileHandle(handle)) return null;
  return handle;
}

export function canonicalizeReleaseArtistCredits<
  T extends { readonly name: string; readonly handle: string | null },
>(
  entries: readonly T[],
  owner: { readonly name: string; readonly handle: string | null }
): T[] {
  return entries.map(entry => ({
    ...entry,
    handle: canonicalizeReleaseArtistHandle({
      handle: entry.handle,
      name: entry.name,
      ownerHandle: owner.handle,
      ownerName: owner.name,
    }),
  }));
}

export function canonicalizeReleaseCreditGroups<
  T extends {
    readonly entries: ReadonlyArray<{
      readonly name: string;
      readonly handle: string | null;
    }>;
  },
>(
  groups: readonly T[] | null | undefined,
  owner: { readonly name: string; readonly handle: string | null }
): T[] | undefined {
  if (!groups) return undefined;
  return groups.map(group => ({
    ...group,
    entries: canonicalizeReleaseArtistCredits(group.entries, owner),
  }));
}

export function decideOpaqueInternalProfileUsername(input: {
  readonly username: string;
  readonly canonicalHandle?: string | null;
}): OpaqueInternalProfileDecision {
  if (!isOpaqueInternalProfileHandle(input.username)) {
    return { action: 'serve' };
  }

  const requested = normalizePublicProfileHandle(input.username);
  const canonical = normalizePublicProfileHandle(input.canonicalHandle);
  if (
    canonical &&
    canonical !== requested &&
    isCanonicalPublicProfileHandle(canonical)
  ) {
    return { action: 'redirect', handle: canonical };
  }

  return { action: 'not_found' };
}

export function publicProfilePathForHandle(handle: string): string {
  return `/${normalizePublicProfileHandle(handle)}`;
}

export function opaqueInternalProfileRedirectPath(
  decision: Extract<OpaqueInternalProfileDecision, { action: 'redirect' }>,
  suffix = ''
): string {
  const tail = suffix.startsWith('/') ? suffix : suffix ? `/${suffix}` : '';
  return `${publicProfilePathForHandle(decision.handle)}${tail}`;
}
