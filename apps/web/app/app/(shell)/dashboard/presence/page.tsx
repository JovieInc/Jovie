import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const runtime = 'nodejs';

/**
 * Legacy dashboard route that redirects to the canonical Presence workspace.
 */
export default async function LegacyPresencePage() {
  redirect(APP_ROUTES.PRESENCE);
}
