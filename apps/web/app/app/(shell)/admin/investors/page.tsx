import { Button } from '@jovie/ui';
import { FileCheck2, Plus, Settings2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { InvestorPipelineTable } from '@/components/features/admin/investors/InvestorPipelineTable';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { loadAdminInvestorPipelineData } from './investors-data';

export const metadata: Metadata = {
  title: 'Investor Pipeline',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin investor pipeline dashboard.
 * Table listing all investors with stage dropdown, scores, and view counts.
 */
export default async function InvestorPipelinePage() {
  await requireCurrentAdminPageAccess();

  return (
    <AdminPage
      title='Investors'
      description='Track investor links, view signals, and active fundraising conversations.'
      testId='admin-investors-page'
      actions={
        <div className='flex items-center gap-2'>
          <Button variant='secondary' size='sm' asChild>
            <Link href={APP_ROUTES.ADMIN_INVESTOR_UPDATES}>
              <FileCheck2 className='mr-1.5 h-3.5 w-3.5' />
              Updates
            </Link>
          </Button>
          <Button variant='secondary' size='sm' asChild>
            <Link href={APP_ROUTES.ADMIN_INVESTORS_SETTINGS}>
              <Settings2 className='mr-1.5 h-3.5 w-3.5' />
              Settings
            </Link>
          </Button>
          <CreateLinkButton />
        </div>
      }
    >
      <Suspense fallback={<TableSkeleton />}>
        <InvestorPipelineTableContent />
      </Suspense>
    </AdminPage>
  );
}

async function InvestorPipelineTableContent() {
  const links = await loadAdminInvestorPipelineData();
  const rows = links.map(link => ({
    id: link.id,
    token: link.token,
    label: link.label,
    investorName: link.investorName || 'Unknown investor',
    stage: link.stage,
    engagementScore: link.engagementScore,
    viewCount: link.viewCount,
    lastViewedLabel: link.lastViewed
      ? new Date(link.lastViewed).toLocaleDateString()
      : 'No views yet',
    isActive: link.isActive,
  }));

  return (
    <ContentSurfaceCard className='overflow-hidden p-0'>
      <InvestorPipelineTable rows={rows} />
    </ContentSurfaceCard>
  );
}

function CreateLinkButton() {
  return (
    <Button size='sm' asChild>
      <Link href={APP_ROUTES.ADMIN_INVESTORS_LINKS}>
        <Plus className='mr-1.5 h-3.5 w-3.5' />
        Create link
      </Link>
    </Button>
  );
}

function TableSkeleton() {
  return (
    <ContentSurfaceCard className='overflow-hidden p-0'>
      <InvestorPipelineTable rows={[]} isLoading />
    </ContentSurfaceCard>
  );
}
