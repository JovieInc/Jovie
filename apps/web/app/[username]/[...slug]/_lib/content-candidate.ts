import 'server-only';

import { and, eq } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { shouldBypassPublicProfileQaCache } from '@/app/[username]/_lib/public-profile-qa';
import { createSmartLinkContentTag, sanitizeCacheTags } from '@/lib/cache/tags';
import { db, withRetry } from '@/lib/db';
import {
  discogRecordings,
  discogReleases,
  discogTracks,
} from '@/lib/db/schema/content';
import { env } from '@/lib/env';
import { logger } from '@/lib/utils/logger';

const PROFILE_MODE_ALIAS_REVALIDATE_SECONDS = 300;

async function fetchProfileModeAliasContentCandidate(
  creatorProfileId: string,
  slug: string
): Promise<boolean> {
  return await withRetry(async () => {
    // This is deliberately a conservative presence check, not a public-content
    // eligibility decision. Any matching row delegates to the canonical smart-
    // link resolver; only three definite misses may take the fast alias path.
    const results = await Promise.allSettled([
      db
        .select({ id: discogReleases.id })
        .from(discogReleases)
        .where(
          and(
            eq(discogReleases.creatorProfileId, creatorProfileId),
            eq(discogReleases.slug, slug)
          )
        )
        .limit(1),
      db
        .select({ id: discogRecordings.id })
        .from(discogRecordings)
        .where(
          and(
            eq(discogRecordings.creatorProfileId, creatorProfileId),
            eq(discogRecordings.slug, slug)
          )
        )
        .limit(1),
      db
        .select({ id: discogTracks.id })
        .from(discogTracks)
        .where(
          and(
            eq(discogTracks.creatorProfileId, creatorProfileId),
            eq(discogTracks.slug, slug)
          )
        )
        .limit(1),
    ]);

    if (
      results.some(
        result => result.status === 'fulfilled' && result.value.length > 0
      )
    ) {
      return true;
    }

    const failedResult = results.find(result => result.status === 'rejected');
    if (failedResult?.status === 'rejected') {
      throw failedResult.reason;
    }

    return false;
  }, `profileModeAliasContentCandidate(${creatorProfileId}:${slug})`);
}

/**
 * Proves only that a legacy profile-mode alias cannot resolve as smart-link
 * content. A positive result still delegates every eligibility, precedence,
 * and rendering decision to getContentBySlug.
 */
export const hasProfileModeAliasContentCandidate = cache(
  async (creatorProfileId: string, slug: string): Promise<boolean> => {
    const load = () =>
      fetchProfileModeAliasContentCandidate(creatorProfileId, slug);

    try {
      if (
        env.NODE_ENV === 'test' ||
        env.NODE_ENV === 'development' ||
        shouldBypassPublicProfileQaCache()
      ) {
        return await load();
      }

      return await unstable_cache(
        load,
        [`profile-mode-alias-content-candidate-${creatorProfileId}-${slug}`],
        {
          tags: sanitizeCacheTags([
            'smartlink-content',
            createSmartLinkContentTag(creatorProfileId),
            `${createSmartLinkContentTag(creatorProfileId)}:${slug}`,
          ]),
          revalidate: PROFILE_MODE_ALIAS_REVALIDATE_SECONDS,
        }
      )();
    } catch (error) {
      logger.error(
        'Failed profile mode alias content candidate check',
        {
          creatorProfileId,
          error,
          helper: 'hasProfileModeAliasContentCandidate',
          route: '/[username]/[...slug]',
          slug,
        },
        'public-profile'
      );
      // Never turn uncertainty into a cached profile-mode redirect.
      throw error;
    }
  }
);
