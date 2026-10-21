import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

/**
 * Needs You folded into Ovie Home's asks (Tim 2026-10-21: one Home, no
 * scrolling). The same Linear and certification decisions appear there.
 */
export default async function NeedsYouPage(): Promise<never> {
  await requireCurrentAdminPageAccess();
  redirect(APP_ROUTES.OV);
}
