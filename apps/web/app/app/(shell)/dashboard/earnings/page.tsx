import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';

export const runtime = 'nodejs';

export default async function EarningsPage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect(
      `${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.DASHBOARD_EARNINGS}`
    );
  }

  redirect(`${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=earn#pay`);
}
