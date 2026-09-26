'use client';

// @coverage-via apps/web/tests/unit/components/features/admin/hud/CompanyActivityFeed.test.tsx
import { BadgeCheck } from 'lucide-react';
import { useMemo } from 'react';
import { HudStatusPill } from '@/app/app/(shell)/admin/ops/HudStatusPill';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  COMPANY_ACTIVITY_STATE_LABELS,
  type CompanyActivityFeedData,
  type CompanyActivityRow,
  type CompanyActivitySourceId,
  type CompanyActivitySourceStatus,
  type CompanyActivityState,
  composeCompanyActivity,
} from '@/lib/hud/company-activity';
import type {
  OvieMacHudInFlightPullRequests,
  OvieMacHudPublicDigest,
  OvieMacHudReceiptedShip,
} from '@/lib/hud/ovie-mac-hud';
import { useHudShippingStateQuery } from './useHudShippingStateQuery';

const SOURCE_LABELS: Record<CompanyActivitySourceId, string> = {
  linear: 'Linear',
  github: 'GitHub',
  receipts: 'Receipts',
  digest: "What's New",
};

const SOURCE_STATUS_LABELS: Record<CompanyActivitySourceStatus, string> = {
  ok: 'Live',
  empty: 'Empty',
  stale: 'Stale',
  unavailable: 'Unavailable',
};

const SOURCE_STATUS_TONES: Record<
  CompanyActivitySourceStatus,
  'good' | 'warning' | 'bad' | 'neutral'
> = {
  ok: 'good',
  empty: 'neutral',
  stale: 'warning',
  unavailable: 'bad',
};

function stateTone(
  state: CompanyActivityState
): 'good' | 'warning' | 'bad' | 'neutral' {
  if (state === 'blocked' || state === 'failed') return 'bad';
  if (state === 'merged' || state === 'deployed' || state === 'public') {
    return 'good';
  }
  if (state === 'in-review' || state === 'merge-queued') return 'warning';
  return 'neutral';
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'time unknown';
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return 'time unknown';
  const diffSeconds = Math.floor((Date.now() - time) / 1000);
  if (diffSeconds < 0) return 'just now';
  if (diffSeconds < 60) return 'just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(time).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function ActivityRow({ row }: Readonly<{ readonly row: CompanyActivityRow }>) {
  const meta = [
    row.actor,
    row.detail,
    formatRelativeTime(row.occurredAt),
  ].filter(Boolean);

  const body = (
    <>
      <div className='flex min-h-6 items-start justify-between gap-2'>
        <p className='min-w-0 flex-1 truncate text-app font-medium text-primary-token'>
          {row.linearIdentifier ? (
            <span className='font-semibold text-secondary-token'>
              {row.linearIdentifier}
            </span>
          ) : null}{' '}
          {row.title}
        </p>
        <HudStatusPill
          label={COMPANY_ACTIVITY_STATE_LABELS[row.state]}
          tone={stateTone(row.state)}
        />
      </div>
      <p className='mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 text-2xs text-tertiary-token'>
        <span className='truncate'>{meta.join(' · ')}</span>
        {row.prUrl ? (
          <span className='font-medium text-secondary-token'>
            PR #{row.prNumber}
          </span>
        ) : null}
        {row.receipted ? (
          <span className='inline-flex items-center gap-0.5 font-medium text-accent-green'>
            <BadgeCheck className='h-3 w-3' aria-hidden='true' />
            Receipted
          </span>
        ) : null}
      </p>
    </>
  );

  const className =
    'block rounded-lg px-2 py-2 text-left outline-none transition-colors duration-subtle hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset';

  return (
    <li key={row.id}>
      {row.href ? (
        <a
          className={className}
          href={row.href}
          rel='noreferrer'
          target='_blank'
        >
          {body}
        </a>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  );
}

export function CompanyActivityFeedView({
  feed,
}: Readonly<{ readonly feed: CompanyActivityFeedData }>) {
  const sourceEntries = (
    Object.keys(SOURCE_LABELS) as readonly CompanyActivitySourceId[]
  ).map(id => ({ id, status: feed.sources[id] }));

  return (
    <ContentSurfaceCard
      className='flex flex-col'
      data-testid='ovie-mac-hud-activity-feed'
    >
      <div className='flex min-h-6 flex-wrap items-center justify-between gap-2 p-3.5 pb-0'>
        <p className='truncate text-2xs font-semibold tracking-normal text-tertiary-token'>
          Company Activity
        </p>
        <div className='flex shrink-0 items-center gap-1.5'>
          {sourceEntries.map(({ id, status }) => (
            <HudStatusPill
              key={id}
              label={`${SOURCE_LABELS[id]} ${SOURCE_STATUS_LABELS[status]}`}
              tone={SOURCE_STATUS_TONES[status]}
            />
          ))}
        </div>
      </div>

      <div className='mt-3 px-3.5 pb-3.5'>
        {feed.rows.length > 0 ? (
          <ol
            className='grid max-h-96 gap-1 overflow-auto pr-1'
            data-testid='ovie-mac-hud-activity-rows'
          >
            {feed.rows.map(row => (
              <ActivityRow key={row.id} row={row} />
            ))}
          </ol>
        ) : (
          <div className='flex min-h-30 items-center text-app leading-5 text-secondary-token'>
            No company activity observed from connected sources.
          </div>
        )}
        {feed.truncated ? (
          <p className='mt-2 text-2xs text-tertiary-token'>
            Showing the most recent activity.
          </p>
        ) : null}
      </div>
    </ContentSurfaceCard>
  );
}

export function CompanyActivityFeed({
  pullRequests,
  receiptedShips,
  receiptsAvailable,
  publicDigest,
}: Readonly<{
  readonly pullRequests: OvieMacHudInFlightPullRequests;
  readonly receiptedShips: readonly OvieMacHudReceiptedShip[];
  readonly receiptsAvailable: boolean;
  readonly publicDigest: OvieMacHudPublicDigest | null;
}>) {
  const { operationalTasks } = useHudShippingStateQuery(null);
  const feed = useMemo(
    () =>
      composeCompanyActivity({
        operationalTasks,
        pullRequests,
        receiptedShips,
        receiptsAvailable,
        publicDigest,
      }),
    [
      operationalTasks,
      pullRequests,
      receiptedShips,
      receiptsAvailable,
      publicDigest,
    ]
  );
  return <CompanyActivityFeedView feed={feed} />;
}
