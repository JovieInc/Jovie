import type { SearchableRelease } from './header-search-results';

const MAX_RESULTS = 5;

function isSearchableRelease(value: unknown): value is SearchableRelease {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.smartLinkPath === 'string' &&
    (candidate.artistNames === undefined ||
      (Array.isArray(candidate.artistNames) &&
        candidate.artistNames.every(name => typeof name === 'string')))
  );
}

export async function searchHeaderLibraryAssets(
  query: string,
  signal: AbortSignal
): Promise<readonly SearchableRelease[]> {
  const params = new URLSearchParams({
    q: query,
    limit: MAX_RESULTS.toString(),
  });
  const response = await fetch(`/api/search/header?${params.toString()}`, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    throw new Error('Header search request failed');
  }

  const body = (await response.json()) as unknown;
  const releases =
    body && typeof body === 'object'
      ? (body as Record<string, unknown>).releases
      : undefined;
  if (
    !Array.isArray(releases) ||
    releases.length > MAX_RESULTS ||
    !releases.every(isSearchableRelease)
  ) {
    throw new TypeError('Header search returned an invalid response');
  }

  return releases.map(release => ({
    id: release.id,
    title: release.title,
    artistNames: release.artistNames,
    smartLinkPath: release.smartLinkPath,
  }));
}
