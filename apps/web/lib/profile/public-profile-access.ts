/** Owner-controlled public access. Missing choices preserve legacy behavior. */
export function isProfileSearchable(settings: unknown): boolean {
  if (settings === undefined || settings === null) return true;
  if (typeof settings !== 'object' || Array.isArray(settings)) return false;
  if (!Object.hasOwn(settings, 'searchable')) return true;
  return (settings as Record<string, unknown>).searchable === true;
}

/**
 * Owner marks the profile as primarily for a young audience (TRK-6).
 * Missing/malformed settings fail closed to "not young" so existing profiles
 * keep current pixel behavior until the creator opts in.
 */
export function isYoungAudienceProfile(settings: unknown): boolean {
  if (settings === undefined || settings === null) return false;
  if (typeof settings !== 'object' || Array.isArray(settings)) return false;
  return (settings as Record<string, unknown>).youngAudience === true;
}

/** Canonical booleans plus known legacy Neon true encodings; never arbitrary truthiness. */
export function isPublicProfilePublished(value: unknown): boolean {
  return value === true || value === 1 || value === 't';
}

/**
 * Profile updates that must hard-expire the public snapshot (`expire: 0`)
 * instead of soft revalidation — visibility, searchability, and young-audience
 * pixel suppress (TRK-6) all change what visitors may see/load.
 */
export function isPrivacyAffectingProfileUpdate(updates: {
  readonly isPublic?: unknown;
  readonly settings?: {
    readonly searchable?: unknown;
    readonly youngAudience?: unknown;
  } | null;
}): boolean {
  return (
    updates.isPublic !== undefined ||
    updates.settings?.searchable !== undefined ||
    updates.settings?.youngAudience !== undefined
  );
}
