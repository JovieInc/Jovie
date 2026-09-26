'use client';

// @coverage-via apps/web/tests/unit/components/features/admin/hud/CompanyActivityFeed.test.tsx
import { HudStatusPill } from '@/app/app/(shell)/admin/ops/HudStatusPill';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  type CompanyActivityRow,
  type CompanyActivityRowState,
  composeCompanyActivityRows,
} from '@/lib/hud/company-activity';
import type { OvieMacHudSnapshot } from '@/lib/hud/ovie-mac-hud';
import type { ShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';
import { useHudShippingStateQuery } from './useHudShippingStateQuery';

type OperationalTaskFeed = ShippingCockpitProjection['operationalTasks'];

const STATE_LABELS: Record<CompanyActivityRowState, string> = {
  queued: 'Queued',
  'in-progress': 'In Progress',
  'in-review': 'In Review',
  'merge-queued': 'Merge Queued',
  merged: 'Merged',
  deployed: 'Deployed',
  'publicly-available': 'Public',
  blocked: 'Blocked',
  failed: 'Failed',
};

const SOURCE_LABELS: Record<CompanyActivityRow['source'], string> = {
  linear: 'Linear',
  'symphony-runtime': 'Runtime',
  github: 'GitHub',
  'public-digest': "What's New",
};

function stateTone(
  state: CompanyActivityRowState
): 'good' | 'warning' | 'bad' | 'neutral' {
  if (
    state === 'deployed' ||
    state === 'publicly-available' ||
    state === 'merged'
  ) {
    return 'good';
  }
  if (state === 'blocked' || state === 'failed') return 'bad';
  if (state === 'in-review' || state === 'merge-queued') return 'warning';
  return 'neutral';
}

function freshnessMeta(feed: OperationalTaskFeed, requestError: boolean) {
  if (requestError) return { label: 'Sync Failed', tone: 'bad' as const };
  switch (feed.syncState) {
    case 'fresh':
      return { label: 'Fresh', tone: 'good' as const };
    case 'stale':
      return { label: 'Stale', tone: 'warning' as const };
    default:
      return { label: 'Unknown', tone: 'neutral' as const };
  }
}

function CompanyActivityRowView({
  row,
}: Readonly<{ row: CompanyActivityRow }>) {
  const body = (
    <>
      <div className='flex min-h-6 items-start justify-between gap-2'>
        <p className='min-w-0 flex-1 truncate text-app font-medium text-primary-token'>
          {row.title}
        </p>
        <HudStatusPill
          label={STATE_LABELS[row.state]}
          tone={stateTone(row.state)}
        />
      </div>
      <p className='mt-1 truncate text-2xs text-tertiary-token'>
        {SOURCE_LABELS[row.source]}
        {row.linearIdentifier ? ` · ${row.linearIdentifier}` : ''}
        {row.receipt ? ` · receipt ${row.receipt}` : ''}
      </p>
    </>
  );

  return (
    <li data-testid={`company-activity-row-${row.id}`}>
      {row.href ? (
        <a
          className='block rounded-lg px-2 py-2 text-left outline-none transition-colors duration-subtle hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset'
          href={row.href}
          rel='noreferrer'
          target='_blank'
        >
          {body}
        </a>
      ) : (
        <div className='px-2 py-2'>{body}</div>
      )}
    </li>
  );
}

export function CompanyActivityFeedView({
  rows,
  syncLabel,
  syncTone,
}: Readonly<{
  readonly rows: readonly CompanyActivityRow[];
  readonly syncLabel: string;
  readonly syncTone: 'good' | 'warning' | 'bad' | 'neutral';
}>) {
  return (
    <ContentSurfaceCard
      surface='details'
      className='overflow-hidden'
      data-testid='ovie-company-activity-feed'
    >
      <div className='flex min-h-16 items-center justify-between gap-3 border-b border-subtle px-3 py-2'>
        <div className='min-w-0'>
          <h2 className='text-app font-semibold text-primary-token'>
            Company Activity
          </h2>
          <p className='truncate text-2xs text-tertiary-token'>
            Linear ledger · runtime · GitHub · verified receipts · What’s New
          </p>
        </div>
        <HudStatusPill label={syncLabel} tone={syncTone} />
      </div>
      <div className='h-72 overflow-y-auto p-2' aria-live='polite'>
        {rows.length === 0 ? (
          <div className='grid h-full place-items-center text-center'>
            <p className='text-app text-secondary-token'>
              No company activity observed.
            </p>
          </div>
        ) : (
          <ol className='grid gap-1'>
            {rows.map(row => (
              <CompanyActivityRowView key={row.id} row={row} />
            ))}
          </ol>
        )}
      </div>
    </ContentSurfaceCard>
  );
}

/**
 * Single company activity feed (JOV-5322): Linear work ledger rows, Symphony
 * runtime-hot tasks, GitHub in-flight/merge-queue rows, verified ship
 * receipts, and the curated public What's New digest — each with exact state
 * and provenance. Merged ≠ deployed ≠ publicly available.
 */
export function CompanyActivityFeed({
  snapshot,
}: Readonly<{ readonly snapshot: OvieMacHudSnapshot }>) {
  const query = useHudShippingStateQuery(null);
  const requestError =
    !query.isFetching && query.operationalRequestState === 'error';
  const meta = freshnessMeta(query.operationalTasks, requestError);
  const rows = composeCompanyActivityRows({
    operationalTasks: query.operationalTasks,
    inFlightPullRequests: snapshot.inFlightPullRequests,
    shippedReceipts: snapshot.companyActivity.shippedReceipts,
    receiptsAvailable: snapshot.companyActivity.receiptsAvailable,
    publicDigest: snapshot.companyActivity.publicDigest,
  });

  return (
    <CompanyActivityFeedView
      rows={rows}
      syncLabel={meta.label}
      syncTone={meta.tone}
    />
  );
}
