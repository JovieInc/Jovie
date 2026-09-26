'use client';

// @coverage-via apps/web/tests/unit/components/features/admin/hud/OvieActivityFeed.test.tsx
import { ExternalLink, GitPullRequest } from 'lucide-react';
import { useMemo } from 'react';
import { HudStatusPill } from '@/app/app/(shell)/admin/ops/HudStatusPill';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  mergeOvieActivityFeed,
  type OvieActivityFeed,
  type OvieActivityFeedRow,
  type OvieActivityFeedState,
} from '@/lib/hud/ovie-activity-feed';
import { useHudShippingStateQuery } from './useHudShippingStateQuery';

function stateTone(
  state: OvieActivityFeedState
): 'good' | 'warning' | 'bad' | 'neutral' {
  switch (state) {
    case 'deployed':
    case 'publicly-available':
      return 'good';
    case 'in-progress':
    case 'queued':
      return 'warning';
    case 'blocked':
    case 'failed':
      return 'bad';
    default:
      return 'neutral';
  }
}

function freshnessLabel(row: OvieActivityFeedRow): string | null {
  if (row.freshness === 'stale') return 'stale';
  if (row.freshness === 'unknown') return 'unknown';
  return null;
}

function feedSummary(feed: OvieActivityFeed): string {
  if (feed.availability === 'not_configured') return 'No Signal';
  if (feed.availability === 'error') return 'Signal Error';
  if (feed.rows.length === 0) return '0 Events';
  const count = feed.rows.length.toLocaleString('en-US');
  return feed.truncated ? `${count}+ Events` : `${count} Events`;
}

function FeedRowLinks({
  row,
}: Readonly<{ readonly row: OvieActivityFeedRow }>) {
  return (
    <span className='flex shrink-0 items-center gap-1.5'>
      {row.prUrl ? (
        <a
          aria-label={`Open pull request for ${row.title}`}
          className='rounded p-0.5 text-tertiary-token outline-none transition-colors duration-subtle hover:text-primary-token focus-visible:ring-2 focus-visible:ring-focus'
          href={row.prUrl}
          rel='noreferrer'
          target='_blank'
        >
          <GitPullRequest className='h-3.5 w-3.5' aria-hidden='true' />
        </a>
      ) : null}
      {row.linearUrl ? (
        <a
          aria-label={`Open ${row.linearIdentifier} in Linear`}
          className='rounded p-0.5 text-tertiary-token outline-none transition-colors duration-subtle hover:text-primary-token focus-visible:ring-2 focus-visible:ring-focus'
          href={row.linearUrl}
          rel='noreferrer'
          target='_blank'
        >
          <ExternalLink className='h-3.5 w-3.5' aria-hidden='true' />
        </a>
      ) : null}
    </span>
  );
}

function FeedRow({ row }: Readonly<{ readonly row: OvieActivityFeedRow }>) {
  const inner = (
    <>
      <div className='flex min-h-6 items-start justify-between gap-2'>
        <p className='min-w-0 flex-1 truncate text-app font-medium text-primary-token'>
          {row.linearIdentifier ? (
            <span className='font-normal text-tertiary-token'>
              {row.linearIdentifier}{' '}
            </span>
          ) : null}
          {row.title}
        </p>
        <FeedRowLinks row={row} />
        <HudStatusPill label={row.stateLabel} tone={stateTone(row.state)} />
      </div>
      <p className='mt-1 truncate text-2xs text-tertiary-token'>
        {row.actor ? `${row.actor} · ` : ''}
        {row.detail}
        {freshnessLabel(row) ? ` · ${freshnessLabel(row)}` : ''}
      </p>
    </>
  );

  if (row.digestUrl) {
    return (
      <li>
        <a
          className='block rounded-lg px-2 py-2 text-left outline-none transition-colors duration-subtle hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset'
          href={row.digestUrl}
        >
          {inner}
        </a>
      </li>
    );
  }
  return <li className='px-2 py-2'>{inner}</li>;
}

export function OvieActivityFeed({
  feed,
}: Readonly<{ readonly feed: OvieActivityFeed }>) {
  const { operationalTasks } = useHudShippingStateQuery(null);
  const merged = useMemo(
    () => mergeOvieActivityFeed(feed, operationalTasks),
    [feed, operationalTasks]
  );

  return (
    <ContentSurfaceCard data-testid='ovie-activity-feed'>
      <div className='flex min-h-40 flex-col p-4'>
        <div className='flex min-h-6 items-center justify-between gap-3'>
          <p className='truncate text-2xs font-semibold tracking-normal text-tertiary-token'>
            Company activity
          </p>
          <span className='shrink-0 text-2xs font-medium text-secondary-token'>
            {feedSummary(merged)}
          </span>
        </div>
        <div className='mt-3 min-h-24'>
          {merged.rows.length > 0 ? (
            <ol className='grid max-h-96 gap-1 overflow-auto pr-1'>
              {merged.rows.map(row => (
                <FeedRow key={row.id} row={row} />
              ))}
            </ol>
          ) : (
            <div className='flex min-h-24 items-center text-app leading-5 text-secondary-token'>
              {merged.availability === 'available' ||
              merged.availability === 'partial'
                ? 'No activity yet.'
                : 'Activity sources unavailable.'}
            </div>
          )}
        </div>
      </div>
    </ContentSurfaceCard>
  );
}
