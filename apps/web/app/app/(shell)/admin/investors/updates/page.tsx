import { Button } from '@jovie/ui';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { APP_ROUTES } from '@/constants/routes';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { loadInvestorUpdateReviewState } from '@/lib/investors/update-store';
import { InvestorUpdateReview } from './InvestorUpdateReview';

export const metadata: Metadata = { title: 'Investor Updates' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function InvestorUpdatesPage() {
  await requireCurrentAdminPageAccess();
  const initialState = await loadInvestorUpdateReviewState();

  return (
    <AdminPage
      title='Investor updates'
      description='Review source-backed candidates and approve an exact monthly snapshot. Approval never sends.'
      testId='admin-investor-updates-page'
      actions={
        <Button variant='secondary' size='sm' asChild>
          <Link href={APP_ROUTES.ADMIN_INVESTORS}>
            <ArrowLeft className='mr-1.5 h-3.5 w-3.5' />
            Investors
          </Link>
        </Button>
      }
    >
      <InvestorUpdateReview initialState={initialState} />
    </AdminPage>
  );
}
