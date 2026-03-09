import { redirect } from 'next/navigation';

import { APP_ROUTES } from '@/constants/routes';

/**
 * Legacy dashboard route (/app/dashboard)
 * Redirects to the app dashboard overview instead of the marketing homepage.
 */
export default async function LegacyDashboardPage() {
  redirect(APP_ROUTES.DASHBOARD);
}
