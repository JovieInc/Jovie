import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { getAppFlagValue } from '@/lib/flags/server';

export const runtime = 'nodejs';

/**
 * Legacy presence route — redirects to the unified Profiles workspace.
 */
export default async function LegacyPresencePage() {
  const profilesWorkspaceEnabled = await getAppFlagValue('PROFILES_WORKSPACE');
  redirect(
    profilesWorkspaceEnabled
      ? APP_ROUTES.PROFILES
      : `${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=music`
  );
}
