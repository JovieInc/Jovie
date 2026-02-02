import { redirect } from 'next/navigation';

/**
 * Legacy dashboard route (/app/dashboard)
 * Redirects to app root (/app) for clean URLs
 */
export default async function LegacyDashboardPage() {
  redirect('/app');
}
