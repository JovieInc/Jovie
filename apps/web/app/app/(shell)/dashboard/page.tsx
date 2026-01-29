import { redirect } from 'next/navigation';

/**
 * Legacy dashboard route (/dashboard)
 * Redirects to app root (/) for clean URLs
 */
export default async function LegacyDashboardPage() {
  redirect('/');
}
