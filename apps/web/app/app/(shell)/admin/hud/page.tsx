import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

/**
 * Default `/hud` (including the packaged Mac `?ovie=mac` door) rewrites here
 * and lands on Ovie Home (founder decision 2026-10-20). Kiosk tokens and
 * `?fs=1` bypass this rewrite and keep the isolated Ops presentation; the
 * full dashboard lives at /app/ov/ops.
 */
export default async function AdminHudRedirectPage() {
  await requireCurrentAdminPageAccess();
  redirect(APP_ROUTES.OV);
}
