import type { Metadata } from 'next';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { TimActionRequiredSection } from '@/components/features/admin/TimActionRequiredSection';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

export const metadata: Metadata = { title: 'Needs You | Ovie' };
export const runtime = 'nodejs';

export default async function NeedsYouPage() {
  await requireCurrentAdminPageAccess();

  return (
    <AdminPage
      title='Needs You'
      description='Only founder judgments whose highest-value next action cannot be automated safely.'
      testId='founder-needs-you-page'
    >
      <TimActionRequiredSection presentation='page' />
    </AdminPage>
  );
}
