import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

export const metadata: Metadata = {
  title: 'YC Command Center',
};

export const runtime = 'nodejs';

export default async function YcMetricsPage() {
  await requireCurrentAdminPageAccess();

  // YC metrics (cash, funnel) live on the Ops dashboard; the legacy
  // redirect map (ADMIN_LEGACY_REDIRECT_MAP) owns this destination.
  redirect(APP_ROUTES.ADMIN_OPS);
}
