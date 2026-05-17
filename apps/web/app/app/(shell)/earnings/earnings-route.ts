import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';

export async function redirectFromEarningsRoute(returnPath: string) {
  const { userId } = await getCachedAuth();

  if (!userId) {
    const redirectUrl = encodeURIComponent(returnPath);
    redirect(`${APP_ROUTES.SIGNIN}?redirect_url=${redirectUrl}`);
  }

  redirect(`${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=earn#pay`);
}
