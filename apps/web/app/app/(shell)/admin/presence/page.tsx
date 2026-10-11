import type { Metadata } from 'next';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { loadCompanyPresenceData } from '@/lib/ovie/company-presence/load.server';
import { CompanyPresenceWorkspace } from './CompanyPresenceWorkspace';

export const metadata: Metadata = {
  title: 'Presence | Admin',
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
