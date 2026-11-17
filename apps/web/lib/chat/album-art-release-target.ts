import 'server-only';

import type { SuggestedReleaseTarget } from '@/lib/services/album-art/types';
import { resolveChatRelease } from './catalog-query';
import type { ReleaseContext } from './types';

function normalizeReleaseTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function toSuggestedReleaseTarget(
  release: ReleaseContext
): SuggestedReleaseTarget {
  return {
    id: release.id,
    title: release.title,
    releaseDate: release.releaseDate,
    artworkUrl: release.artworkUrl,
  };
}

export async function resolveAlbumArtReleaseTarget(
  profileId: string | null,
  releases: ReleaseContext[],
  input: { releaseId?: string; releaseTitle?: string }
): Promise<
  | { status: 'resolved'; release: ReleaseContext }
  | {
      status: 'needs_target';
      suggestedReleases: readonly SuggestedReleaseTarget[];
    }
> {
  if (input.releaseId) {
    const resolved = await resolveChatRelease(profileId, releases, input);
    if (resolved) return { status: 'resolved', release: resolved };
  }

  if (!input.releaseTitle?.trim()) {
    return {
      status: 'needs_target',
      suggestedReleases: releases.slice(0, 8).map(toSuggestedReleaseTarget),
    };
  }

  // Full-catalog exact must beat a loaded partial.
  const exact = await resolveChatRelease(profileId, releases, {
    releaseTitle: input.releaseTitle,
    match: 'exact',
  });
  if (exact) return { status: 'resolved', release: exact };

  const normalized = normalizeReleaseTitle(input.releaseTitle);
  const normalizedExact = releases.find(
    release => normalizeReleaseTitle(release.title) === normalized
  );
  if (normalizedExact) return { status: 'resolved', release: normalizedExact };
  const fuzzy = releases.filter(release => {
    const title = normalizeReleaseTitle(release.title);
    return title.includes(normalized) || normalized.includes(title);
  });

  if (fuzzy.length === 1) {
    return { status: 'resolved', release: fuzzy[0] };
  }

  return {
    status: 'needs_target',
    suggestedReleases: (fuzzy.length > 0 ? fuzzy : releases)
      .slice(0, 8)
      .map(toSuggestedReleaseTarget),
  };
}
