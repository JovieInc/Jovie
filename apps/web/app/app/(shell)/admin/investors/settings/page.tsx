import type { Metadata } from 'next';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
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
    <PageShell>
      <PageContent>
        <h1 className='sr-only'>Investor portal settings</h1>
        <InvestorSettingsForm />
      </PageContent>
    </PageShell>
  );
}
