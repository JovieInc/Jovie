import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

/**
 * Legacy Ops URL. Canonical Ops lives at /hud.
 */
export default function AdminOpsRedirectPage() {
  redirect(APP_ROUTES.HUD);
}
