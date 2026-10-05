import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { getAppFlagValue } from '@/lib/flags/server';

export const runtime = 'nodejs';

/**
 * Legacy dashboard route that redirects to the canonical Presence workspace.
 */
export default async function LegacyPresencePage() {
  const profilesWorkspaceEnabled = await getAppFlagValue('PROFILES_WORKSPACE');
  redirect(
    profilesWorkspaceEnabled
      ? APP_ROUTES.PRESENCE
      : `${APP_ROUTES.SETTINGS_PROFILE}?tab=music`
  );
}
