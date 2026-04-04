import type { Metadata } from 'next';
import { AdminToolPage } from '@/components/features/admin/layout/AdminToolPage';
import { InvestorLinksManager } from './InvestorLinksManager';

export const metadata: Metadata = {
  title: 'Investor Links',
};

/**
 * Admin investor links management page.
 * Create new links, copy URLs, toggle active/inactive.
 */
export default function InvestorLinksPage() {
  return (
    <AdminToolPage
      title='Investor Links'
      description='Create, copy, and disable investor links without leaving the admin shell.'
      testId='admin-investors-links-page'
    >
      <InvestorLinksManager />
    </AdminToolPage>
  );
}
