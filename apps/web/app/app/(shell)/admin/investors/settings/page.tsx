import type { Metadata } from 'next';
import { AdminToolPage } from '@/components/features/admin/layout/AdminToolPage';
import { InvestorSettingsForm } from './InvestorSettingsForm';

export const metadata: Metadata = {
  title: 'Investor Portal Settings',
};

/**
 * Admin investor portal settings page.
 * Toggle progress bar, set raise target, configure URLs, etc.
 */
export default function InvestorSettingsPage() {
  return (
    <AdminToolPage
      title='Investor Settings'
      description='Configure the investor portal, progress display, and follow-up defaults.'
      testId='admin-investors-settings-page'
    >
      <InvestorSettingsForm />
    </AdminToolPage>
  );
}
