import { aliasBudgetProfileModeParams } from '@/lib/routing/alias-budget-static-params';
import {
  getProfilesByUsernames,
  getTopProfilesForStaticGeneration,
} from '@/lib/services/profile/queries';
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

export async function getProfileModeRenderStaticParams(): Promise<
  Array<{
    username: string;
    profileMode: string;
    marker: string;
  }>
> {
  try {
    const modes = aliasBudgetProfileModeParams();
    const usernames = [...new Set(modes.map(mode => mode.username))];
    const profiles = await getProfilesByUsernames(usernames);
    return modes.flatMap(mode => {
      const profile = profiles.get(mode.username);
      if (!profile?.isPublic) return [];
      return [mode];
    });
  } catch (error) {
    logger.error(
      'Failed to load profile mode render static params',
      {
        error,
        route: '/[username]/profile-mode-render/[profileMode]/[marker]',
      },
      'public-profile'
    );
    // A missing build database must not fail deployment. The on-demand route
    // remains the runtime fallback.
    return [];
  }
}
