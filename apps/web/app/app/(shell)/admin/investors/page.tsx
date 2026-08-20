import { Button } from '@jovie/ui';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Settings2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { UnifiedTableSkeleton } from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { InvestorPipelineTable } from './_components/InvestorPipelineTable';
import { loadAdminInvestorPipelineData } from './investors-data';

export const metadata: Metadata = {
  title: 'Investor Pipeline',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type InvestorPipelineSkeletonRow = {
  readonly label: string;
  readonly investor: string;
  readonly stage: string;
  readonly score: string;
  readonly views: string;
  readonly lastViewed: string;
  readonly status: string;
};

const INVESTOR_TABLE_MIN_WIDTH = '760px';

const INVESTOR_TABLE_SKELETON_COLUMNS = [
  {
    id: 'label',
    header: 'Label',
    size: 200,
    minSize: 180,
  },
  {
    id: 'investor',
    header: 'Investor',
    size: 150,
    minSize: 140,
  },
  {
    id: 'stage',
    header: 'Stage',
    size: 100,
    minSize: 96,
  },
  {
    id: 'score',
    header: 'Score',
    size: 64,
    minSize: 56,
  },
  {
    id: 'views',
    header: 'Views',
    size: 64,
    minSize: 56,
  },
  {
    id: 'lastViewed',
    header: 'Last Viewed',
    size: 110,
    minSize: 96,
  },
  {
    id: 'status',
    header: 'Status',
    size: 72,
    minSize: 64,
  },
] satisfies ColumnDef<InvestorPipelineSkeletonRow, unknown>[];

const INVESTOR_TABLE_SKELETON_COLUMN_CONFIG = [
  { variant: 'release' as const, width: '100%' },
  { variant: 'text' as const, width: '100%' },
  { variant: 'badge' as const, width: '72px' },
  { variant: 'text' as const, width: '40px' },
  { variant: 'text' as const, width: '40px' },
  { variant: 'meta' as const, width: '100%' },
  { variant: 'badge' as const, width: '72px' },
];

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
        <InvestorPipelineTableData />
      </Suspense>
    </AdminPage>
  );
}

async function InvestorPipelineTableData() {
  const links = await loadAdminInvestorPipelineData();
  return <InvestorPipelineTable links={links} />;
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
      <UnifiedTableSkeleton<InvestorPipelineSkeletonRow>
        columns={INVESTOR_TABLE_SKELETON_COLUMNS}
        skeletonRows={5}
        skeletonColumnConfig={INVESTOR_TABLE_SKELETON_COLUMN_CONFIG}
        rowHeight={40}
        minWidth={INVESTOR_TABLE_MIN_WIDTH}
        containerClassName='px-3 py-3'
      />
    </ContentSurfaceCard>
  );
}
