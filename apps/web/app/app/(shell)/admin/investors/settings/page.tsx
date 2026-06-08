import { Button } from '@jovie/ui';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { APP_ROUTES } from '@/constants/routes';
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
    <AdminPage
      title='Investor Settings'
      description='Configure the investor portal, progress display, and follow-up defaults.'
      testId='admin-investors-settings-page'
      actions={
        <Button variant='secondary' size='sm' asChild>
          <Link href={APP_ROUTES.ADMIN_INVESTORS}>
            <ArrowLeft className='mr-1.5 h-3.5 w-3.5' />
            Pipeline
          </Link>
        </Button>
      }
    >
      <InvestorSettingsForm />
    </AdminPage>
  );
}
