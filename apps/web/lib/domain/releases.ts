import 'server-only';
import { revalidatePath } from 'next/cache';
import { APP_ROUTES } from '@/constants/routes';
import { invalidateReleaseCaches } from '@/lib/cache/releases';
import { db } from '@/lib/db';
import { isUniqueViolation } from '@/lib/db/errors';
import { discogReleases } from '@/lib/db/schema/content';
import { generateUniqueSlug } from '@/lib/discography/slug';

/**
 * Release create: the ONE domain function behind the Releases form action and
 * the Summer/Jovi chat tool. Both used to write on their own (the form
 * slugified and set status, reveal date, genres and the explicit flag; the
 * chat tool upserted with a different slug and none of those), so the same
 * request saved different rows. Anything that creates a release goes through
 * here; `tests/unit/domain/release-paths.test.ts` pins that both paths store
 * identical rows and `chat-tools-use-domain.test.ts` pins that no chat tool
 * writes the tables directly.
 */
export type ReleaseStatusValue = 'draft' | 'scheduled' | 'released';

export type CreatableReleaseType =
  | 'single'
  | 'ep'
  | 'album'
  | 'compilation'
  | 'live'
  | 'mixtape'
  | 'other';

export interface CreateReleaseInput {
  /** The signed-in user (cache scope). */
  readonly userId: string;
  /** The profile the release belongs to, already authorized by the caller. */
  readonly profileId: string;
  readonly title: string;
  readonly releaseType: CreatableReleaseType;
  /** ISO date or datetime; null or absent means a draft. */
  readonly releaseDate?: string | null;
  readonly revealDate?: string | null;
  readonly genres?: readonly string[];
  readonly isExplicit?: boolean;
  readonly label?: string | null;
  readonly upc?: string | null;
}

export type CreateReleaseResult =
  | {
      readonly ok: true;
      readonly release: {
        readonly id: string;
        readonly slug: string;
        readonly title: string;
        readonly releaseType: CreatableReleaseType;
        readonly releaseDate: Date | null;
        readonly status: ReleaseStatusValue;
        readonly label: string | null;
      };
    }
  | {
      readonly ok: false;
      readonly code: 'title-required' | 'bad-date' | 'duplicate' | 'failed';
      readonly message: string;
    };

export function determineReleaseStatus(
  releaseDate: Date | null
): ReleaseStatusValue {
  if (!releaseDate) return 'draft';
  return releaseDate > new Date() ? 'scheduled' : 'released';
}

function parseDate(value: string | null | undefined): Date | null | 'invalid' {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'invalid' : parsed;
}

export async function createReleaseForProfile(
  input: CreateReleaseInput
): Promise<CreateReleaseResult> {
  const title = input.title.trim();
  if (!title)
    return {
      ok: false,
      code: 'title-required',
      message: 'Title is required.',
    };

  const releaseDate = parseDate(input.releaseDate);
  const revealDate = parseDate(input.revealDate);
  if (releaseDate === 'invalid' || revealDate === 'invalid')
    return {
      ok: false,
      code: 'bad-date',
      message: 'Invalid date. Please use YYYY-MM-DD format.',
    };

  const status = determineReleaseStatus(releaseDate);
  // One slug rule for every path: the canonical discography slug, made unique
  // per profile (a repeated title gets a suffix instead of failing or, worse,
  // overwriting the earlier release).
  const slug = await generateUniqueSlug(input.profileId, title, 'release');

  try {
    const [inserted] = await db
      .insert(discogReleases)
      .values({
        creatorProfileId: input.profileId,
        title,
        slug,
        releaseType: input.releaseType,
        releaseDate,
        status,
        revealDate,
        genres: input.genres?.slice(0, 3) ?? null,
        isExplicit: input.isExplicit ?? false,
        label: input.label ?? null,
        upc: input.upc ?? null,
        sourceType: 'manual',
        totalTracks: input.releaseType === 'single' ? 1 : 0,
      })
      .returning({ id: discogReleases.id });

    revalidatePath(APP_ROUTES.RELEASES);
    invalidateReleaseCaches(input.userId, input.profileId);

    return {
      ok: true,
      release: {
        id: inserted.id,
        slug,
        title,
        releaseType: input.releaseType,
        releaseDate,
        status,
        label: input.label ?? null,
      },
    };
  } catch (error) {
    if (isUniqueViolation(error))
      return {
        ok: false,
        code: 'duplicate',
        message: `A release with the slug "${slug}" already exists. Please choose a different title.`,
      };
    return {
      ok: false,
      code: 'failed',
      message: 'Failed to create release. Please try again.',
    };
  }
}
