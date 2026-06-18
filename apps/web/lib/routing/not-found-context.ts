import { headers } from 'next/headers';
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

function normalizePathname(pathname: string): string {
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

function resolvePathnameFromHeaderValue(value: string | null): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      return new URL(trimmed).pathname;
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith('/')) {
    return normalizePathname(trimmed);
  }

  return null;
}

/**
 * Best-effort pathname resolution for not-found boundaries, which do not
 * receive route params directly.
 */
export async function resolveNotFoundPathname(): Promise<string> {
  const headerStore = await headers();

  return (
    resolvePathnameFromHeaderValue(headerStore.get('next-url')) ??
    resolvePathnameFromHeaderValue(headerStore.get('x-url')) ??
    resolvePathnameFromHeaderValue(headerStore.get('x-invoke-path')) ??
    resolvePathnameFromHeaderValue(headerStore.get('x-matched-path')) ??
    '/'
  );
}
