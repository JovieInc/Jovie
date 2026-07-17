import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const runtime = 'nodejs';

/**
 * Legacy presence route — redirects to the unified Profiles workspace.
 */
export default function LegacyPresencePage() {
  redirect(APP_ROUTES.PROFILES);
}
