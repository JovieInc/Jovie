import type { Metadata } from 'next';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { InvestorLinksManager } from './InvestorLinksManager';

export const metadata: Metadata = {
  title: 'Investor Links',
};

/**
 * Admin investor links management page.
 * Create new links, copy URLs, toggle active/inactive.
 */
export default async function InvestorLinksPage() {
  await requireCurrentAdminPageAccess();

  return (
    <AdminPage
      title='Investor Links'
      description='Create, copy, and disable investor links without leaving the admin shell.'
      testId='admin-investors-links-page'
    >
      <InvestorLinksManager />
    </AdminPage>
  );
}
