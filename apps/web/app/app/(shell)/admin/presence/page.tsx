import type { Metadata } from 'next';
import { APP_ROUTES } from '@/constants/routes';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { getSidebarRouteLabel } from '@/lib/constants/sidebar-route-labels';
import { loadCompanyPresenceData } from '@/lib/ovie/company-presence/load.server';
import { CompanyPresenceWorkspace } from './CompanyPresenceWorkspace';

export const metadata: Metadata = {
  title: getSidebarRouteLabel(APP_ROUTES.ADMIN_PRESENCE, 'ov'),
};

export const runtime = 'nodejs';

export default async function AdminPresencePage() {
  const actorId = await requireCurrentAdminPageAccess();
  const data = await loadCompanyPresenceData();
  return (
    <CompanyPresenceWorkspace
      data={data}
      scope={{ actorId, workspaceId: 'jovie-company', target: 'company' }}
    />
  );
}
