import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { getAppFlagValue } from '@/lib/flags/server';

export const runtime = 'nodejs';

/**
 * Legacy presence alias. Profiles now live in the unified workspace.
 */
export default async function PresencePage() {
  const profilesWorkspaceEnabled = await getAppFlagValue('PROFILES_WORKSPACE');
  redirect(
    profilesWorkspaceEnabled
      ? APP_ROUTES.PROFILES
      : `${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=music`
  );
}
