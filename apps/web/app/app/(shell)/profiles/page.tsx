import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { getAppFlagValue } from '@/lib/flags/server';

export const runtime = 'nodejs';

/** Legacy workspace alias retained for bookmarks created before JOV-7161. */
export default async function ProfilesPage() {
  const profilesWorkspaceEnabled = await getAppFlagValue('PROFILES_WORKSPACE');
  redirect(
    profilesWorkspaceEnabled
      ? APP_ROUTES.PRESENCE
      : `${APP_ROUTES.SETTINGS_PROFILE}?tab=music`
  );
}
