import { Button } from '@jovie/ui';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { EmptyState } from '@/components/molecules/EmptyState';
import { APP_ROUTES } from '@/constants/routes';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { captureError } from '@/lib/error-tracking';
import { InvestorUpdateWorkflowError } from '@/lib/investors/update-contract';
import { loadInvestorUpdateReviewState } from '@/lib/investors/update-store';
import { InvestorUpdateReview } from './InvestorUpdateReview';

export const metadata: Metadata = { title: 'Investor Updates' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function InvestorUpdatesPage() {
  await requireCurrentAdminPageAccess();

  let initialState: Awaited<
    ReturnType<typeof loadInvestorUpdateReviewState>
  > | null = null;
  let loadError: string | null = null;

  try {
    initialState = await loadInvestorUpdateReviewState();
  } catch (error) {
    loadError =
      error instanceof InvestorUpdateWorkflowError
        ? error.message
        : 'Check server logs and retry.';
    await captureError('Admin investor-updates page failed to load', error, {
      route: 'admin/investors/updates',
    });
  }

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
      {initialState ? (
        <InvestorUpdateReview initialState={initialState} />
      ) : (
        <EmptyState
          variant='error'
          heading='Could not load investor updates.'
          description={loadError ?? 'Check server logs and retry.'}
          testId='admin-investor-updates-error'
        />
      )}
    </AdminPage>
  );
}
