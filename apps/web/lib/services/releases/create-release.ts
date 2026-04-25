import 'server-only';

import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { slugify } from '@/lib/utils';

export type ManagedReleaseType =
  | 'single'
  | 'ep'
  | 'album'
  | 'compilation'
  | 'live'
  | 'mixtape'
  | 'other';

type ReleaseStatusValue = 'draft' | 'scheduled' | 'released';

export class ReleaseCreationError extends Error {
  readonly code: 'TITLE_REQUIRED' | 'INVALID_SLUG' | 'DUPLICATE_SLUG';

  constructor(code: ReleaseCreationError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

function determineReleaseStatus(releaseDate: Date | null): ReleaseStatusValue {
  if (!releaseDate) return 'draft';
  return releaseDate > new Date() ? 'scheduled' : 'released';
}

function computeRevealDate(
  formRevealDate: string | null,
  releaseDate: Date | null,
  status: ReleaseStatusValue
): Date | null {
  if (formRevealDate) return new Date(formRevealDate);
  if (!releaseDate || status !== 'scheduled') return null;
  const thirtyDaysBefore = new Date(releaseDate);
  thirtyDaysBefore.setDate(thirtyDaysBefore.getDate() - 30);
  const now = new Date();
  return thirtyDaysBefore > now ? thirtyDaysBefore : now;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

export async function createManagedRelease(params: {
  readonly id?: string;
  readonly profileId: string;
  readonly title: string;
  readonly releaseType: ManagedReleaseType;
  readonly releaseDate?: string | null;
  readonly revealDate?: string | null;
  readonly genres?: readonly string[];
  readonly isExplicit?: boolean;
  readonly label?: string | null;
  readonly upc?: string | null;
  readonly artworkUrl?: string | null;
  readonly metadata?: Record<string, unknown>;
}) {
  const title = params.title.trim();
  if (!title) {
    throw new ReleaseCreationError('TITLE_REQUIRED', 'Title is required.');
  }

  const slug = slugify(title);
  if (!slug) {
    throw new ReleaseCreationError(
      'INVALID_SLUG',
      'Could not generate a valid slug from the title.'
    );
  }

  const releaseDate = params.releaseDate ? new Date(params.releaseDate) : null;
  const status = determineReleaseStatus(releaseDate);
  const revealDate = computeRevealDate(
    params.revealDate ?? null,
    releaseDate,
    status
  );

  try {
    const [inserted] = await db
      .insert(discogReleases)
      .values({
        id: params.id,
        creatorProfileId: params.profileId,
        title,
        slug,
        releaseType: params.releaseType,
        releaseDate,
        status,
        revealDate,
        genres: params.genres?.slice(0, 3) ?? null,
        isExplicit: params.isExplicit ?? false,
        label: params.label ?? null,
        upc: params.upc ?? null,
        sourceType: 'manual',
        totalTracks: params.releaseType === 'single' ? 1 : 0,
        artworkUrl: params.artworkUrl ?? null,
        metadata: params.metadata,
      })
      .returning({ id: discogReleases.id, slug: discogReleases.slug });

    return {
      id: inserted.id,
      slug: inserted.slug,
      title,
      releaseDate,
      status,
      revealDate,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ReleaseCreationError(
        'DUPLICATE_SLUG',
        `A release with the slug "${slug}" already exists. Please choose a different title.`
      );
    }
    throw error;
  }
}
