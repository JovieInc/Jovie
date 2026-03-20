import { desc, sql as drizzleSql } from 'drizzle-orm';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
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
    <div className='space-y-6 p-6'>
      <div className='flex items-center justify-between'>
        <h1 className='text-xl font-semibold'>Investor Pipeline</h1>
        <CreateLinkButton />
      </div>

      <Suspense fallback={<TableSkeleton />}>
        <InvestorTable />
      </Suspense>
    </div>
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
      <div className='rounded-lg border border-dashed p-12 text-center'>
        <p className='text-sm text-muted-foreground'>
          No investor links yet. Create one to get started.
        </p>
      </div>
    );
  }

  return (
    <div className='overflow-x-auto rounded-lg border'>
      <table className='w-full text-sm'>
        <thead>
          <tr className='border-b bg-muted/50'>
            <th className='px-4 py-3 text-left font-medium'>Label</th>
            <th className='px-4 py-3 text-left font-medium'>Name</th>
            <th className='px-4 py-3 text-left font-medium'>Stage</th>
            <th className='px-4 py-3 text-left font-medium'>Score</th>
            <th className='px-4 py-3 text-left font-medium'>Views</th>
            <th className='px-4 py-3 text-left font-medium'>Last Viewed</th>
            <th className='px-4 py-3 text-left font-medium'>Active</th>
          </tr>
        </thead>
        <tbody>
          {links.map(link => (
            <tr key={link.id} className='border-b hover:bg-muted/30'>
              <td className='px-4 py-3 font-medium'>{link.label}</td>
              <td className='px-4 py-3 text-muted-foreground'>
                {link.investorName || '—'}
              </td>
              <td className='px-4 py-3'>
                <StageBadge stage={link.stage} />
              </td>
              <td className='px-4 py-3'>
                <ScoreBadge score={link.engagementScore} />
              </td>
              <td className='px-4 py-3 text-muted-foreground'>
                {link.viewCount}
              </td>
              <td className='px-4 py-3 text-muted-foreground'>
                {link.lastViewed
                  ? new Date(link.lastViewed).toLocaleDateString()
                  : '—'}
              </td>
              <td className='px-4 py-3'>{link.isActive ? '✓' : '✗'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const colors: Record<string, string> = {
    shared: 'bg-gray-500/20 text-gray-400',
    viewed: 'bg-blue-500/20 text-blue-400',
    engaged: 'bg-amber-500/20 text-amber-400',
    meeting_booked: 'bg-purple-500/20 text-purple-400',
    committed: 'bg-green-500/20 text-green-400',
    wired: 'bg-emerald-500/20 text-emerald-300',
    passed: 'bg-red-500/20 text-red-400',
    declined: 'bg-red-500/20 text-red-400',
  };

  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[stage] ?? 'bg-gray-500/20 text-gray-400'}`}
    >
      {stage.replace('_', ' ')}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  let color = 'text-muted-foreground';
  if (score >= 50) color = 'text-green-400';
  else if (score >= 25) color = 'text-amber-400';

  return <span className={`font-mono text-xs ${color}`}>{score}</span>;
}

function CreateLinkButton() {
  return (
    <Link
      href={APP_ROUTES.ADMIN_INVESTORS_LINKS}
      className='rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground'
    >
      Create Link
    </Link>
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
    <div className='space-y-2'>
      {TABLE_SKELETON_KEYS.map(skeletonKey => (
        <div
          key={skeletonKey}
          className='h-12 animate-pulse rounded bg-muted/30'
        />
      ))}
    </div>
  );
}
