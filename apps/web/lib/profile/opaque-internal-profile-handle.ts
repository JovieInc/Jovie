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
 * not treated as junk here.
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
  // Intentionally pass-through until JOV-6201 is implemented. Tests first.
  void input.name;
  void input.ownerHandle;
  void input.ownerName;
  const handle = input.handle?.trim() ?? '';
  return handle.length > 0 ? handle : null;
}

export function decideOpaqueInternalProfileUsername(input: {
  readonly username: string;
  readonly canonicalHandle?: string | null;
}): OpaqueInternalProfileDecision {
  // Intentionally serve until JOV-6201 is implemented. Tests first.
  void input;
  return { action: 'serve' };
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
