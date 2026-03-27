import { Button } from '@jovie/ui';
import { desc, sql as drizzleSql } from 'drizzle-orm';
import { Plus, Settings2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { InvestorLinksTable } from '@/components/features/admin/investors/InvestorLinksTable';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  PageContent,
  PageHeader,
  PageShell,
} from '@/components/organisms/PageShell';
import { APP_ROUTES } from '@/constants/routes';
import { db } from '@/lib/db';
import { investorLinks } from '@/lib/db/schema/investors';

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
    <PageShell>
      <PageHeader
        title='Investor pipeline'
        description='Track investor links, engagement signals, and active fundraising conversations.'
        action={
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
      />
      <PageContent>
        <div className='space-y-4'>
          <ContentSurfaceCard className='overflow-hidden p-0'>
            <ContentSectionHeader
              title='Pipeline health'
              subtitle='Keep the investor workflow focused on active links, engagement, and follow-up momentum.'
            />
            <div className='grid gap-3 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y) sm:grid-cols-3'>
              <SummaryCard
                label='Pipeline view'
                value='Investor links'
                description='Every link is a lightweight deal room with stage tracking.'
              />
              <SummaryCard
                label='Signal capture'
                value='View + stage history'
                description='Keep engagement, recency, and status visible in one list.'
              />
              <SummaryCard
                label='Next action'
                value='Create or follow up'
                description='Use links, notes, and stage changes to keep momentum moving.'
              />
            </div>
          </ContentSurfaceCard>

          <Suspense fallback={<TableSkeleton />}>
            <InvestorTable />
          </Suspense>
        </div>
      </PageContent>
    </PageShell>
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

  return (
    <ContentSurfaceCard className='overflow-hidden p-0'>
      <ContentSectionHeader
        title='Active investor links'
        subtitle={`${links.length} tracked link${links.length === 1 ? '' : 's'} across your pipeline.`}
      />
      <InvestorLinksTable links={links} />
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
      <p className='text-[11px] uppercase tracking-[0.08em] text-tertiary-token'>
        {label}
      </p>
      <p className='mt-1 text-[14px] font-[560] tracking-[-0.016em] text-primary-token'>
        {value}
      </p>
      <p className='mt-1 text-[12px] leading-[18px] text-secondary-token'>
        {description}
      </p>
    </ContentSurfaceCard>
  );
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
