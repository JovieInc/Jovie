import type { Metadata } from 'next';
import { APP_ROUTES } from '@/constants/routes';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { getSidebarRouteLabel } from '@/lib/constants/sidebar-route-labels';
import PresencePage from '../../presence/page';

export const metadata: Metadata = {
  title: getSidebarRouteLabel(APP_ROUTES.ADMIN_PRESENCE, 'ov'),
};

export const runtime = 'nodejs';

export default async function AdminPresencePage() {
  await requireCurrentAdminPageAccess();
  return PresencePage();
}
