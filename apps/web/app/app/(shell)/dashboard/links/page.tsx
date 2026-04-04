import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';

export const runtime = 'nodejs';

export default async function LinksPage() {
  const { userId } = await getCachedAuth();

  // Handle unauthenticated users
  if (!userId) {
    redirect(
      `${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.DASHBOARD_PROFILE}`
    );
  }

  redirect(APP_ROUTES.DASHBOARD_PROFILE);
}
