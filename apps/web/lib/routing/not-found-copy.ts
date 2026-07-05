import { getPublicProfileCandidate } from '@/lib/routing/proxy-routing';

export type NotFoundVariant = 'profile-miss' | 'generic';

export interface NotFoundCopy {
  readonly title: string;
  readonly description: string;
}

export const NOT_FOUND_COPY: Readonly<Record<NotFoundVariant, NotFoundCopy>> = {
  'profile-miss': {
    title: 'Profile not found',
    description: "This profile doesn't exist.",
  },
  generic: {
    title: "We can't find that page.",
    description: 'The link may be broken or the page may have been removed.',
  },
};

/**
 * Profile-specific copy only applies to single-segment handle lookups that
 * passed the public-profile candidate gate. Everything else is generic.
 */
export function resolveNotFoundVariant(pathname: string): NotFoundVariant {
  const normalizedPath = normalizePathname(pathname);
  const segments = normalizedPath.split('/').filter(Boolean);

  if (segments.length !== 1) {
    return 'generic';
  }

  return getPublicProfileCandidate(normalizedPath) ? 'profile-miss' : 'generic';
}

export function getNotFoundCopy(variant: NotFoundVariant): NotFoundCopy {
  return NOT_FOUND_COPY[variant];
}

export function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed) return '/';

  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return new URL(trimmed).pathname;
    }
  } catch {
    // Fall through to the relative-path normalization below.
  }

  const withoutQuery = trimmed.split('?')[0]?.split('#')[0] ?? trimmed;
  const withLeadingSlash = withoutQuery.startsWith('/')
    ? withoutQuery
    : `/${withoutQuery}`;

  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith('/')) {
    return withLeadingSlash.slice(0, -1);
  }

  return withLeadingSlash;
}
