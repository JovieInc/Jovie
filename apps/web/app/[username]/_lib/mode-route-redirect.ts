import type { ProfileMode } from '@/features/profile/contracts';
import { getProfileModeHref } from '@/features/profile/registry';

type RedirectSourceSearchParams = {
  readonly source?: string | string[];
};

function normalizeSource(
  source: string | string[] | undefined
): string | undefined {
  if (typeof source === 'string' && source.length > 0) {
    return source;
  }

  if (Array.isArray(source)) {
    return source.find(value => value.length > 0);
  }

  return undefined;
}

export function getProfileModeRedirectHref(
  username: string,
  searchParams: RedirectSourceSearchParams | undefined,
  mode: Exclude<ProfileMode, 'profile'>
) {
  const source = normalizeSource(searchParams?.source);
  const searchSuffix = source
    ? `source=${encodeURIComponent(source)}`
    : undefined;

  return getProfileModeHref(username, mode, searchSuffix);
}

const LEGACY_PROFILE_MODE_BY_SLUG: Readonly<
  Record<string, Exclude<ProfileMode, 'profile'>>
> = {
  listen: 'listen',
  music: 'listen',
  releases: 'releases',
  subscribe: 'subscribe',
  tip: 'pay',
  tour: 'tour',
};

export function isLegacyProfileModeAlias(slug: string): boolean {
  return Object.hasOwn(LEGACY_PROFILE_MODE_BY_SLUG, slug);
}

/**
 * Resolves a legacy profile-mode alias after the smart-link route has proved
 * that the slug does not belong to published, renamed, or unpublished music.
 * Alias requests are routed after filesystem matches into the catch-all
 * resolver, so static application routes retain priority and real releases
 * called `music` or `tour` keep their public URLs.
 */
export function getLegacyProfileModeRedirectHref(
  username: string,
  slug: string,
  searchParams: RedirectSourceSearchParams | undefined
): string | null {
  if (!isLegacyProfileModeAlias(slug)) return null;
  const mode = LEGACY_PROFILE_MODE_BY_SLUG[slug];
  if (!mode) return null;

  return getProfileModeRedirectHref(username, searchParams, mode);
}
