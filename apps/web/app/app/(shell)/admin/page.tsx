import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

/**
 * Legacy Overview URL. Company Ops lives at /hud.
 */
export default function AdminOverviewRedirectPage() {
  redirect(APP_ROUTES.HUD);
}
