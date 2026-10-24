import 'server-only';

import { unstable_cache } from 'next/cache';
import {
  getLegacyProfileModeRedirectHref,
  isLegacyProfileModeAlias,
} from '@/app/[username]/_lib/mode-route-redirect';
import { shouldBypassPublicProfileQaCache } from '@/app/[username]/_lib/public-profile-qa';
import { hasProfileModeAliasContentCandidate } from '@/app/[username]/[...slug]/_lib/content-candidate';
import {
  getContentBySlug,
  getCreatorByUsername,
  getUnpublishedReleasePresence,
} from '@/app/[username]/[slug]/_lib/data';
import { sanitizeCacheTags } from '@/lib/cache/tags';
import { findRedirectByOldSlug } from '@/lib/discography/slug';

/**
 * Single owner for the legacy profile-mode alias resolution decision
 * (`/<username>/<reserved-alias>`), shared by the catch-all smart-link
 * resolver page and the edge decision endpoint so the two can never disagree:
 * unknown creator -> `missing` (404); content (or an unpublished release) at
 * the slug -> `content` (render the canonical smart-link page at the alias
 * URL); renamed-content old slug -> `moved` (permanent redirect); otherwise
 * `mode` (temporary redirect to `/<username>?mode=<mode>`).
 */
export type ProfileModeAliasDecisionKind =
  | 'content'
  | 'missing'
  | 'mode'
  | 'moved';

export interface ProfileModeAliasDecision {
  readonly creatorUsername?: string;
  readonly href?: string;
  readonly kind: ProfileModeAliasDecisionKind;
}

const PROFILE_MODE_ALIAS_COLLISION_REVALIDATE_SECONDS = 300;

async function getAliasCollisionState(
  creatorProfileId: string,
  aliasSlug: string
) {
  const load = () =>
    Promise.all([
      findRedirectByOldSlug(creatorProfileId, aliasSlug, {
        onError: 'throw',
      }),
      getUnpublishedReleasePresence(creatorProfileId, aliasSlug, {
        onError: 'throw',
      }),
    ]);

  if (
    process.env.NODE_ENV === 'test' ||
    process.env.NODE_ENV === 'development' ||
    shouldBypassPublicProfileQaCache()
  ) {
    return load();
  }

  return unstable_cache(
    load,
    [`profile-mode-alias-collision-${creatorProfileId}-${aliasSlug}`],
    {
      tags: sanitizeCacheTags([
        'smartlink-content',
        `smartlink-content:${creatorProfileId}`,
        `smartlink-content:${creatorProfileId}:${aliasSlug}`,
      ]),
      revalidate: PROFILE_MODE_ALIAS_COLLISION_REVALIDATE_SECONDS,
    }
  )();
}

export function isValidProfileModeAliasRequest(
  username: string,
  aliasSlug: string
): boolean {
  return username.length > 0 && isLegacyProfileModeAlias(aliasSlug);
}

export async function resolveProfileModeAliasDecision(
  username: string,
  aliasSlug: string,
  source?: string
): Promise<ProfileModeAliasDecision> {
  const creator = await getCreatorByUsername(username.toLowerCase());
  if (!creator) return { kind: 'missing' };

  // Start independent collision and candidate checks together. The common
  // profile-mode alias path performs bounded ID-only checks in parallel;
  // any possible content still delegates to the canonical smart-link loader.
  const collisionStatePromise = getAliasCollisionState(
    creator.id,
    aliasSlug
  ).then(
    value => ({ ok: true as const, value }),
    error => ({ error, ok: false as const })
  );
  const hasContentCandidate = await hasProfileModeAliasContentCandidate(
    creator.id,
    aliasSlug
  );
  const content = hasContentCandidate
    ? await getContentBySlug(creator.id, aliasSlug)
    : null;
  if (!content) {
    const collisionState = await collisionStatePromise;
    if (!collisionState.ok) throw collisionState.error;
    const [oldSlugRedirect, unpublished] = collisionState.value;
    if (oldSlugRedirect) {
      return {
        creatorUsername: creator.usernameNormalized,
        href: `/${creator.usernameNormalized}/${oldSlugRedirect.currentSlug}`,
        kind: 'moved',
      };
    }

    if (!unpublished) {
      const legacyModeHref = getLegacyProfileModeRedirectHref(
        creator.usernameNormalized,
        aliasSlug,
        source ? { source } : undefined
      );
      if (legacyModeHref) {
        return {
          creatorUsername: creator.usernameNormalized,
          href: legacyModeHref,
          kind: 'mode',
        };
      }
      return { creatorUsername: creator.usernameNormalized, kind: 'missing' };
    }
  }

  // Published and unpublished collisions keep the original public URL and use
  // the canonical smart-link renderer. Data helpers are request-memoized, so
  // the caller reusing them does not turn this into duplicate DB work.
  return { creatorUsername: creator.usernameNormalized, kind: 'content' };
}
