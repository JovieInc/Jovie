import { aliasBudgetProfileModeParams } from '@/lib/routing/alias-budget-static-params';
import { PROFILE_MODE_PRERENDERED_KEYS } from '@/lib/routing/generated/profile-mode-prerender-set';
import { getTopProfilesForStaticGeneration } from '@/lib/services/profile/queries';
import { logger } from '@/lib/utils/logger';

/**
 * Public seeded alias `?mode=` documents that must ship with the build.
 *
 * The featured/claimed prerender set does not include the unclaimed tipping
 * seed. Without a canonical static page, `next.config` rewrites
 * `/{username}?mode=pay` to the private mode route. An empty param list
 * renders that route on demand in the function region. The alias gate's
 * runner is in another region, so the cached pay document still arrives as
 * `sfo1::iad1`. These params keep the rewrite, the server `pay` mode, and
 * the edge redirect, and deploy the document with the build.
 */
export async function getProfileStaticParams(limit = 100): Promise<
  Array<{
    username: string;
  }>
> {
  try {
    return await getTopProfilesForStaticGeneration(limit);
  } catch (error) {
    logger.error(
      'Failed to load profile static params',
      {
        error,
        limit,
        route: '/[username]',
      },
      'public-profile'
    );
    // Build-time DB failures should not block deployment.
    return [];
  }
}

/**
 * Single-sourced from the pre-build script's generated set (JOV-13104).
 *
 * `scripts/write-profile-mode-prerender-set.mjs` answers "which alias-budget
 * pairs have a public profile in the build database" seconds before
 * `next build` and writes PROFILE_MODE_PRERENDERED_KEYS; the proxy bounds the
 * `?mode=` rewrite to that same set. This route used to re-ask the question
 * through the drizzle pool, so a build where that read failed or disagreed
 * (observed in the nightly Visual Regression setup job) prerendered no mode
 * documents while the proxy still rewrote — the rewrite then landed on an
 * un-prerendered pair whose ISR fallback serves the flight-only
 * `__next_error__` 404 shell instead of the profile (JOV-12481). Consuming
 * the generated set makes the prerendered documents and the rewrite bound
 * identical by construction: a pair is prerendered if and only if the proxy
 * is willing to rewrite to it.
 */
export function getProfileModeRenderStaticParams(): Array<{
  username: string;
  profileMode: string;
  marker: string;
}> {
  const prerendered = new Set(PROFILE_MODE_PRERENDERED_KEYS);
  return aliasBudgetProfileModeParams().filter(mode =>
    prerendered.has(`${mode.username}:${mode.profileMode}`)
  );
}
