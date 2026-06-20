import { Badge, Button } from '@jovie/ui';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, CircleSlash, Plus, Settings2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { UnifiedTableSkeleton } from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';
import {
  InvestorTable,
  InvestorTableBody,
  InvestorTableCell,
  InvestorTableHead,
  InvestorTableHeaderCell,
  InvestorTableHeaderRow,
  InvestorTableRow,
} from './_components/InvestorTablePrimitives';
import { loadAdminInvestorPipelineData } from './investors-data';
import { TokenCopyButton } from './TokenCopyButton';

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
    header: 'Last viewed',
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
export default function InvestorPipelinePage() {
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
        <InvestorPipelineTable />
      </Suspense>
    </AdminPage>
  );
}

async function InvestorPipelineTable() {
  const links = await loadAdminInvestorPipelineData();

  if (links.length === 0) {
    return (
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <div className='px-(--linear-app-header-padding-x) py-6 text-app text-secondary-token'>
          No investor links yet.
        </div>
      </ContentSurfaceCard>
    );
  }

  return (
    <ContentSurfaceCard
      className='overflow-hidden p-0'
      data-testid='admin-investors-table'
    >
      <InvestorTable minWidth='min-w-190'>
        <InvestorTableHead>
          <InvestorTableHeaderRow>
            <InvestorTableHeaderCell className='w-50'>
              Label
            </InvestorTableHeaderCell>
            <InvestorTableHeaderCell className='w-38'>
              Investor
            </InvestorTableHeaderCell>
            <InvestorTableHeaderCell className='w-25'>
              Stage
            </InvestorTableHeaderCell>
            <InvestorTableHeaderCell className='w-16'>
              Score
            </InvestorTableHeaderCell>
            <InvestorTableHeaderCell className='w-16'>
              Views
            </InvestorTableHeaderCell>
            <InvestorTableHeaderCell className='w-28'>
              Last viewed
            </InvestorTableHeaderCell>
            <InvestorTableHeaderCell className='w-18'>
              Status
            </InvestorTableHeaderCell>
          </InvestorTableHeaderRow>
        </InvestorTableHead>
        <InvestorTableBody>
          {links.map(link => (
            <InvestorTableRow key={link.id}>
              <InvestorTableCell className='w-50'>
                <div className='flex min-w-0 flex-col gap-0.5'>
                  <span className='truncate font-semibold text-primary-token'>
                    {link.label}
                  </span>
                  <TokenDisplay token={link.token} />
                </div>
              </InvestorTableCell>
              <InvestorTableCell className='w-38'>
                {link.investorName || 'Unknown investor'}
              </InvestorTableCell>
              <InvestorTableCell className='w-25'>
                <StageBadge stage={link.stage} />
              </InvestorTableCell>
              <InvestorTableCell className='w-16'>
                <ScoreBadge score={link.engagementScore} />
              </InvestorTableCell>
              <InvestorTableCell className='w-16'>
                {link.viewCount}
              </InvestorTableCell>
              <InvestorTableCell className='w-28'>
                {link.lastViewed
                  ? new Date(link.lastViewed).toLocaleDateString()
                  : 'No views yet'}
              </InvestorTableCell>
              <InvestorTableCell className='w-18'>
                <StatusBadge isActive={link.isActive} />
              </InvestorTableCell>
            </InvestorTableRow>
          ))}
        </InvestorTableBody>
      </InvestorTable>
    </ContentSurfaceCard>
  );
}

function StageBadge({ stage }: Readonly<{ stage: string }>) {
  const styles: Record<
    string,
    {
      label: string;
      variant: 'default' | 'secondary' | 'warning' | 'success' | 'destructive';
    }
  > = {
    shared: { label: 'Shared', variant: 'secondary' },
    viewed: { label: 'Viewed', variant: 'default' },
    engaged: { label: 'Engaged', variant: 'warning' },
    meeting_booked: { label: 'Meeting booked', variant: 'default' },
    committed: { label: 'Committed', variant: 'success' },
    wired: { label: 'Wired', variant: 'success' },
    passed: { label: 'Passed', variant: 'destructive' },
    declined: { label: 'Declined', variant: 'destructive' },
  };
  const style = styles[stage] ?? {
    label: stage.replaceAll('_', ' '),
    variant: 'secondary' as const,
  };

  return (
    <Badge variant={style.variant} size='sm'>
      {style.label}
    </Badge>
  );
}

function ScoreBadge({ score }: Readonly<{ score: number }>) {
  let toneClassName = 'text-secondary-token';

  if (score >= 50) {
    toneClassName = 'text-success';
  } else if (score >= 25) {
    toneClassName = 'text-warning';
  }

  return (
    <span
      className={cn(
        'inline-flex min-w-[2.5rem] items-center justify-end font-mono text-xs font-semibold tabular-nums',
        toneClassName
      )}
    >
      {score}
    </span>
  );
}

function StatusBadge({ isActive }: { readonly isActive: boolean }) {
  return isActive ? (
    <span className='inline-flex items-center gap-1.5 text-xs text-secondary-token'>
      <CheckCircle2 className='h-3.5 w-3.5 text-success' />
      Active
    </span>
  ) : (
    <span className='inline-flex items-center gap-1.5 text-xs text-secondary-token'>
      <CircleSlash className='h-3.5 w-3.5 text-tertiary-token' />
      Disabled
    </span>
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

function TokenDisplay({ token }: { readonly token: string }) {
  return <TokenCopyButton token={token} />;
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
