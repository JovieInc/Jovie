import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const runtime = 'nodejs';

/**
 * Legacy presence alias. Profiles now live in the unified workspace.
 */
export default function PresencePage() {
  redirect(APP_ROUTES.PROFILES);
}
