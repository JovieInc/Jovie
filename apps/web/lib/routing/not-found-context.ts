import { normalizePathname } from '@/lib/routing/not-found-copy';

export type {
  NotFoundCopy,
  NotFoundVariant,
} from '@/lib/routing/not-found-copy';
export {
  getNotFoundCopy,
  NOT_FOUND_COPY,
  resolveNotFoundVariant,
} from '@/lib/routing/not-found-copy';

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
  const { headers } = await import('next/headers');
  const headerStore = await headers();

  return (
    resolvePathnameFromHeaderValue(headerStore.get('next-url')) ??
    resolvePathnameFromHeaderValue(headerStore.get('x-url')) ??
    resolvePathnameFromHeaderValue(headerStore.get('x-invoke-path')) ??
    resolvePathnameFromHeaderValue(headerStore.get('x-matched-path')) ??
    '/'
  );
}
