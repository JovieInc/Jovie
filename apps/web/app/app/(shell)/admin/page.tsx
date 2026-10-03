import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

/**
 * Ovie root. The founder lands on the Inbox; Ops lives at /hud.
 */
export default function AdminOverviewRedirectPage() {
  redirect(APP_ROUTES.ADMIN_INBOX);
}
