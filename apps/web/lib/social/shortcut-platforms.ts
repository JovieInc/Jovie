/**
 * Social shortcut slug map for jov.ie/{username}/s/{platform}.
 *
 * Short memorable slugs (ig, tt, x, …) resolve to one or more canonical
 * `social_links.platform` ids. Full platform names are accepted as aliases.
 *
 * @see JOV-3924
 */

/** Canonical short slugs → social_links.platform ids to try (first match wins). */
export const SOCIAL_SHORTCUT_SLUG_MAP = {
  ig: ['instagram'],
  tt: ['tiktok'],
  x: ['x', 'twitter'],
  yt: ['youtube'],
  sp: ['spotify'],
  web: ['website'],
} as const satisfies Record<string, readonly string[]>;

export type SocialShortcutSlug = keyof typeof SOCIAL_SHORTCUT_SLUG_MAP;

/** Full platform name aliases accepted in addition to short slugs. */
const PLATFORM_NAME_ALIASES: Readonly<Record<string, readonly string[]>> = {
  instagram: SOCIAL_SHORTCUT_SLUG_MAP.ig,
  tiktok: SOCIAL_SHORTCUT_SLUG_MAP.tt,
  twitter: SOCIAL_SHORTCUT_SLUG_MAP.x,
  youtube: SOCIAL_SHORTCUT_SLUG_MAP.yt,
  spotify: SOCIAL_SHORTCUT_SLUG_MAP.sp,
  website: SOCIAL_SHORTCUT_SLUG_MAP.web,
};

/**
 * Normalize a path segment and resolve it to social_links.platform ids.
 * Returns null for unknown / empty segments (caller should soft-redirect).
 */
export function resolveSocialShortcutPlatforms(
  raw: string | null | undefined
): readonly string[] | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (!key) return null;

  if (Object.hasOwn(SOCIAL_SHORTCUT_SLUG_MAP, key)) {
    return SOCIAL_SHORTCUT_SLUG_MAP[key as SocialShortcutSlug];
  }

  if (Object.hasOwn(PLATFORM_NAME_ALIASES, key)) {
    return PLATFORM_NAME_ALIASES[key] ?? null;
  }

  // Unknown short/long slug — treat as soft miss (302 to profile), not hard 404.
  return null;
}

/** All short slugs for docs / generators. */
export const SOCIAL_SHORTCUT_SLUGS = Object.keys(
  SOCIAL_SHORTCUT_SLUG_MAP
) as SocialShortcutSlug[];
