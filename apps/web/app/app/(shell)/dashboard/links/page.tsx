import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';

export const runtime = 'nodejs';

export default async function LinksPage() {
  const { userId } = await getCachedAuth();

  // Handle unauthenticated users
  if (!userId) {
    redirect('/sign-in?redirect_url=/app/dashboard/profile');
  }

  redirect(APP_ROUTES.DASHBOARD_PROFILE);
}
