import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import type { SuggestedReleaseTarget } from '@/lib/services/album-art/types';
import { getCanvasStatusFromMetadata } from '@/lib/services/canvas/service';
import type { CanvasStatus } from '@/lib/services/canvas/types';
import { toISOStringOrNull } from '@/lib/utils/date';

export interface ArtistContextLike {
  readonly displayName: string;
  readonly username: string;
  readonly bio: string | null;
  readonly genres: string[];
  readonly spotifyFollowers: number | null;
  readonly spotifyPopularity: number | null;
  readonly spotifyUrl?: string | null;
  readonly appleMusicUrl?: string | null;
  readonly profileViews: number;
  readonly hasSocialLinks: boolean;
  readonly hasMusicLinks: boolean;
  readonly tippingStats: {
    readonly tipClicks: number;
    readonly tipsSubmitted: number;
    readonly totalReceivedCents: number;
    readonly monthReceivedCents: number;
  };
}

export interface ReleaseContext {
  readonly id: string;
  readonly title: string;
  readonly releaseType: string;
  readonly releaseDate: string | null;
  readonly artworkUrl: string | null;
  readonly spotifyPopularity: number | null;
  readonly totalTracks: number;
  readonly canvasStatus: CanvasStatus;
  readonly metadata: Record<string, unknown> | null;
}

export function findReleaseByTitle(
  releases: readonly ReleaseContext[],
  title: string
): ReleaseContext | null {
  const lower = title.toLowerCase();
  return (
    releases.find(r => r.title.toLowerCase() === lower) ??
    releases.find(r => r.title.toLowerCase().includes(lower)) ??
    null
  );
}

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

export function resolveAlbumArtReleaseTarget(
  releases: readonly ReleaseContext[],
  input: { readonly releaseId?: string; readonly releaseTitle?: string }
):
  | { status: 'resolved'; release: ReleaseContext }
  | {
      status: 'needs_target';
      suggestedReleases: readonly SuggestedReleaseTarget[];
    } {
  if (input.releaseId) {
    const release = releases.find(item => item.id === input.releaseId);
    if (release) return { status: 'resolved', release };
  }

  if (!input.releaseTitle?.trim()) {
    return {
      status: 'needs_target',
      suggestedReleases: releases.slice(0, 8).map(toSuggestedReleaseTarget),
    };
  }

  const normalized = normalizeReleaseTitle(input.releaseTitle);
  const exact = releases.find(
    release => normalizeReleaseTitle(release.title) === normalized
  );
  if (exact) return { status: 'resolved', release: exact };

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

export function formatAvailableReleases(
  releases: readonly ReleaseContext[]
): string {
  return releases
    .slice(0, 10)
    .map(r => r.title)
    .join(', ');
}

export async function fetchReleasesForChat(
  profileId: string
): Promise<ReleaseContext[]> {
  const releases = await db
    .select({
      id: discogReleases.id,
      title: discogReleases.title,
      releaseType: discogReleases.releaseType,
      releaseDate: discogReleases.releaseDate,
      artworkUrl: discogReleases.artworkUrl,
      spotifyPopularity: discogReleases.spotifyPopularity,
      totalTracks: discogReleases.totalTracks,
      metadata: discogReleases.metadata,
    })
    .from(discogReleases)
    .where(eq(discogReleases.creatorProfileId, profileId))
    .orderBy(desc(discogReleases.releaseDate))
    .limit(50);

  return releases.map(release => ({
    ...release,
    releaseDate: toISOStringOrNull(release.releaseDate),
    canvasStatus: getCanvasStatusFromMetadata(release.metadata),
  }));
}
