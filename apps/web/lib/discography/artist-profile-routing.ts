const UUID_HEX_PATTERN = /^[0-9a-f]{32}$/;

/** Stable inbound route that survives profile claims, merges, and renames. */
export function artistProfileHref(artistId: string): string {
  return `/artists/${encodeURIComponent(artistId)}`;
}

/**
 * Collision-safe internal handle for an automatically created profile.
 *
 * The full 128-bit registry UUID is encoded in base36 (25 characters) rather
 * than reserving a human-readable name. A future claimant can choose a normal
 * handle while inbound `/artists/:id` links continue to resolve.
 */
export function buildUnclaimedArtistHandle(artistId: string): string {
  const hex = artistId.replaceAll('-', '').toLowerCase();
  if (!UUID_HEX_PATTERN.test(hex)) {
    throw new Error('Artist ID must be a UUID');
  }

  const encodedId = BigInt(`0x${hex}`).toString(36).padStart(25, '0');
  return `a_${encodedId}`;
}
