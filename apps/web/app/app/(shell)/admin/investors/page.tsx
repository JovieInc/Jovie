import { Badge, Button } from '@jovie/ui';
import { desc, sql as drizzleSql } from 'drizzle-orm';
import {
  CheckCircle2,
  CircleSlash,
  Link2,
  Plus,
  Settings2,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AdminToolPage } from '@/components/features/admin/layout/AdminToolPage';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import { db } from '@/lib/db';
import { investorLinks } from '@/lib/db/schema/investors';
import { cn } from '@/lib/utils';
import { TokenCopyButton } from './TokenCopyButton';

export const metadata: Metadata = {
  title: 'Investor Pipeline',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin investor pipeline dashboard.
 * Table listing all investors with stage dropdown, scores, and view counts.
 */
export default function InvestorPipelinePage() {
  return (
    <AdminToolPage
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
      <div
        className='grid gap-3 sm:grid-cols-3'
        data-testid='admin-investors-summary'
      >
        <SummaryCard
          label='Pipeline View'
          value='Investor links'
          description='Every link is a lightweight deal room with stage tracking.'
        />
        <SummaryCard
          label='Signal Capture'
          value='View + stage history'
          description='Keep engagement, recency, and status visible in one list.'
        />
        <SummaryCard
          label='Next Action'
          value='Create or follow up'
          description='Use links, notes, and stage changes to keep momentum moving.'
        />
      </div>

      <Suspense fallback={<TableSkeleton />}>
        <InvestorTable />
      </Suspense>
    </AdminToolPage>
  );
}

async function InvestorTable() {
  const links = await db
    .select({
      id: investorLinks.id,
      token: investorLinks.token,
      label: investorLinks.label,
      investorName: investorLinks.investorName,
      email: investorLinks.email,
      stage: investorLinks.stage,
      engagementScore: investorLinks.engagementScore,
      isActive: investorLinks.isActive,
      notes: investorLinks.notes,
      createdAt: investorLinks.createdAt,
      updatedAt: investorLinks.updatedAt,
      viewCount:
        drizzleSql<number>`(SELECT COUNT(*) FROM investor_views WHERE investor_link_id = ${investorLinks.id})`.as(
          'view_count'
        ),
      lastViewed: drizzleSql<
        string | null
      >`(SELECT MAX(viewed_at) FROM investor_views WHERE investor_link_id = ${investorLinks.id})`.as(
        'last_viewed'
      ),
    })
    .from(investorLinks)
    .orderBy(desc(investorLinks.createdAt));

  if (links.length === 0) {
    return (
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeader
          title='No investor links yet'
          subtitle='Create a first link to start tracking investor views and responses.'
        />
        <div className='flex flex-col items-center gap-3 px-6 py-10 text-center'>
          <div className='flex h-11 w-11 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token'>
            <Link2 className='h-4 w-4' aria-hidden='true' />
          </div>
          <p className='max-w-md text-[13px] leading-[19px] text-secondary-token'>
            Investor links become the canonical handoff surface for deck access,
            memo reviews, and response tracking.
          </p>
          <CreateLinkButton />
        </div>
      </ContentSurfaceCard>
    );
  }

  return (
    <ContentSurfaceCard
      className='overflow-hidden p-0'
      data-testid='admin-investors-table'
    >
      <ContentSectionHeader
        title='Active investor links'
        subtitle={`${links.length} tracked link${links.length === 1 ? '' : 's'} across your pipeline.`}
      />
      <div className='overflow-x-auto'>
        <table className='w-full min-w-[760px] border-collapse text-[13px]'>
          <thead className='bg-surface-0'>
            <tr className='border-b border-subtle text-left text-[11px] uppercase tracking-[0.08em] text-tertiary-token'>
              <th className='px-4 py-2.5 font-semibold'>Label</th>
              <th className='px-4 py-2.5 font-semibold'>Investor</th>
              <th className='px-4 py-2.5 font-semibold'>Stage</th>
              <th className='px-4 py-2.5 font-semibold'>Score</th>
              <th className='px-4 py-2.5 font-semibold'>Views</th>
              <th className='px-4 py-2.5 font-semibold'>Last viewed</th>
              <th className='px-4 py-2.5 font-semibold'>Status</th>
            </tr>
          </thead>
          <tbody>
            {links.map(link => (
              <tr
                key={link.id}
                className='border-b border-subtle bg-transparent transition-colors duration-150 hover:bg-surface-1'
              >
                <td className='px-4 py-3 align-middle'>
                  <div className='flex min-w-0 flex-col'>
                    <span className='truncate font-semibold text-primary-token'>
                      {link.label}
                    </span>
                    <TokenDisplay token={link.token} />
                  </div>
                </td>
                <td className='px-4 py-3 align-middle text-secondary-token'>
                  {link.investorName || 'Unknown investor'}
                </td>
                <td className='px-4 py-3 align-middle'>
                  <StageBadge stage={link.stage} />
                </td>
                <td className='px-4 py-3 align-middle'>
                  <ScoreBadge score={link.engagementScore} />
                </td>
                <td className='px-4 py-3 align-middle text-secondary-token'>
                  {link.viewCount}
                </td>
                <td className='px-4 py-3 align-middle text-secondary-token'>
                  {link.lastViewed
                    ? new Date(link.lastViewed).toLocaleDateString()
                    : 'No views yet'}
                </td>
                <td className='px-4 py-3 align-middle'>
                  <StatusBadge isActive={link.isActive} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
        'inline-flex min-w-[2.5rem] items-center justify-end font-mono text-[12px] font-[590] tabular-nums',
        toneClassName
      )}
    >
      {score}
    </span>
  );
}

function StatusBadge({ isActive }: { readonly isActive: boolean }) {
  return isActive ? (
    <span className='inline-flex items-center gap-1.5 text-[12px] text-secondary-token'>
      <CheckCircle2 className='h-3.5 w-3.5 text-success' />
      Active
    </span>
  ) : (
    <span className='inline-flex items-center gap-1.5 text-[12px] text-secondary-token'>
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

function SummaryCard({
  label,
  value,
  description,
}: Readonly<{
  label: string;
  value: string;
  description: string;
}>) {
  return (
    <ContentSurfaceCard surface='nested' className='p-3.5'>
      <p className='text-[11px] text-tertiary-token'>{label}</p>
      <p className='mt-1 text-[14px] font-semibold tracking-[-0.016em] text-primary-token'>
        {value}
      </p>
      <p className='mt-1 text-[12px] leading-[18px] text-secondary-token'>
        {description}
      </p>
    </ContentSurfaceCard>
  );
}

function TokenDisplay({ token }: { readonly token: string }) {
  return <TokenCopyButton token={token} />;
}

const TABLE_SKELETON_KEYS = [
  'investor-skeleton-1',
  'investor-skeleton-2',
  'investor-skeleton-3',
  'investor-skeleton-4',
  'investor-skeleton-5',
];

function TableSkeleton() {
  return (
    <ContentSurfaceCard className='overflow-hidden p-0'>
      <ContentSectionHeader
        title='Loading investor links'
        subtitle='Preparing the latest pipeline state.'
      />
      <div className='space-y-2 px-3 py-3'>
        {TABLE_SKELETON_KEYS.map(skeletonKey => (
          <div
            key={skeletonKey}
            className='h-11 animate-pulse rounded-[12px] bg-surface-0'
          />
        ))}
      </div>
    </ContentSurfaceCard>
  );
}
