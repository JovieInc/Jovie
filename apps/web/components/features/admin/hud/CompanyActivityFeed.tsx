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
  type CompanyActivityState,
  composeCompanyActivity,
} from '@/lib/hud/company-activity';
import type {
  OvieMacHudInFlightPullRequests,
  OvieMacHudReceiptedShip,
} from '@/lib/hud/ovie-mac-hud';
import { useHudShippingStateQuery } from './useHudShippingStateQuery';

type Tone = 'good' | 'warning' | 'bad' | 'neutral';

function stateTone(state: CompanyActivityState): Tone {
  if (state === 'blocked' || state === 'failed') return 'bad';
  if (state === 'merged' || state === 'deployed' || state === 'public') {
    return 'good';
  }
  if (state === 'in-review' || state === 'merge-queued') return 'warning';
  return 'neutral';
}

function formatRelativeTime(iso: string | null): string {
  const time = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(time)) return 'time unknown';
  const diffMinutes = Math.floor((Date.now() - time) / 60_000);
  if (diffMinutes < 1) return 'just now';
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

function ActivityRow({ row }: { readonly row: CompanyActivityRow }) {
  const meta = [row.actor, row.detail, formatRelativeTime(row.occurredAt)]
    .filter(Boolean)
    .join(' · ');

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
        <span className='truncate'>{meta}</span>
        {row.prNumber != null ? (
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
    <li>
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
}: {
  readonly feed: CompanyActivityFeedData;
}) {
  return (
    <ContentSurfaceCard
      className='flex flex-col'
      data-testid='ovie-mac-hud-activity-feed'
    >
      <div className='flex min-h-6 items-center p-3 pb-0'>
        <p className='truncate text-2xs font-semibold tracking-normal text-tertiary-token'>
          Company Activity
        </p>
      </div>

      <div className='mt-3 px-3 pb-3'>
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
}: Readonly<{
  readonly pullRequests: OvieMacHudInFlightPullRequests;
  readonly receiptedShips: readonly OvieMacHudReceiptedShip[];
}>) {
  const { operationalTasks } = useHudShippingStateQuery(null);
  const feed = useMemo(
    () =>
      composeCompanyActivity({
        operationalTasks,
        pullRequests,
        receiptedShips,
      }),
    [operationalTasks, pullRequests, receiptedShips]
  );
  return <CompanyActivityFeedView feed={feed} />;
}
