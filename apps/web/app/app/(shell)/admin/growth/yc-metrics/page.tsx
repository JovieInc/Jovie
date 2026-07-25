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

  redirect(APP_ROUTES.ADMIN);
}
