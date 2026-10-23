import { decideLegacyAliasCollision } from '@/app/[username]/_lib/alias-collision-decision';
import { hasProfileModeAliasContentCandidate } from '@/app/[username]/[...slug]/_lib/content-candidate';
import {
  getContentBySlug,
  getCreatorByUsername,
  getUnpublishedReleasePresence,
} from '@/app/[username]/[slug]/_lib/data';
import { findRedirectByOldSlug } from '@/lib/discography/slug';
import { isLegacyProfileAliasSlug } from '@/lib/routing/legacy-profile-alias-recovery';

const DECISION_CACHE_CONTROL =
  'public, max-age=0, must-revalidate, s-maxage=300, stale-while-revalidate=300';

interface RouteContext {
  readonly params: Promise<{
    readonly username: string;
    readonly slug: string;
  }>;
}

export async function GET(
  _request: Request,
  context: RouteContext
): Promise<Response> {
  const { username, slug } = await context.params;
  const usernameIsSafe = /^[a-zA-Z0-9._-]{1,30}$/.test(username);
  if (!isLegacyProfileAliasSlug(slug) || !usernameIsSafe) {
    return Response.json(
      { action: 'stay' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const decision = await decideLegacyAliasCollision(username, slug, {
      getCreatorByUsername,
      hasContentCandidate: hasProfileModeAliasContentCandidate,
      getContentBySlug,
      findRedirectByOldSlug: (creatorProfileId, aliasSlug) =>
        findRedirectByOldSlug(creatorProfileId, aliasSlug, {
          onError: 'throw',
        }),
      getUnpublishedReleasePresence: (creatorProfileId, aliasSlug) =>
        getUnpublishedReleasePresence(creatorProfileId, aliasSlug, {
          onError: 'throw',
        }),
    });
    return Response.json(decision, {
      headers: {
        'Cache-Control': DECISION_CACHE_CONTROL,
        'Vercel-CDN-Cache-Control':
          'public, s-maxage=300, stale-while-revalidate=300',
      },
    });
  } catch {
    // The edge redirect already landed on the mode page. Uncertainty must not
    // be cached as a definitive stay, or a release keeps the wrong URL.
    return Response.json(
      { action: 'stay' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
