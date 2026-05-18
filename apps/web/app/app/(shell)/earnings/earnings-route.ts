import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { buildAppShellSignInUrl } from '@/lib/auth/build-app-shell-signin-url';
import { getCachedAuth } from '@/lib/auth/cached';

export async function redirectFromEarningsRoute(returnPath: string) {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect(buildAppShellSignInUrl(returnPath));
  }

  redirect(`${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=earn#pay`);
}
