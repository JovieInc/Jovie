/** Owner-controlled public access. Missing choices preserve legacy behavior. */
export function isProfileSearchable(settings: unknown): boolean {
  if (settings === undefined || settings === null) return true;
  if (typeof settings !== 'object' || Array.isArray(settings)) return false;
  if (!Object.hasOwn(settings, 'searchable')) return true;
  return (settings as Record<string, unknown>).searchable === true;
}

/** TRK-6: explicit `youngAudience: true` only; missing/malformed → not young. */
export function isYoungAudienceProfile(settings: unknown): boolean {
  if (settings === undefined || settings === null) return false;
  if (typeof settings !== 'object' || Array.isArray(settings)) return false;
  return (settings as Record<string, unknown>).youngAudience === true;
}

/** Canonical booleans plus known legacy Neon true encodings; never arbitrary truthiness. */
export function isPublicProfilePublished(value: unknown): boolean {
  return value === true || value === 1 || value === 't';
}

/** Hard-expire public cache when visibility, search, or young-audience changes. */
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
