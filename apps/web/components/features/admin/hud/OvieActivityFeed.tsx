'use client';

// @coverage-via apps/web/tests/unit/components/features/admin/hud/OvieActivityFeed.test.tsx
import { HudStatusPill } from '@/app/app/(shell)/admin/ops/HudStatusPill';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  composeOvieActivityRows,
  type OvieActivityRow,
  type OvieActivitySources,
  type OvieActivityState,
  observeOvieActivityFeed,
} from '@/lib/hud/company-activity';
import { useHudShippingStateQuery } from './useHudShippingStateQuery';

function stateTone(
  state: OvieActivityState
): 'good' | 'warning' | 'bad' | 'neutral' {
  switch (state) {
    case 'deployed':
    case 'public':
      return 'good';
    case 'blocked':
    case 'failed':
      return 'bad';
    case 'in_progress':
    case 'merged':
      return 'warning';
    default:
      return 'neutral';
  }
}

function freshnessLabel(row: OvieActivityRow): string | null {
  if (row.freshness === 'stale') return 'stale';
  if (row.freshness === 'unknown') return 'freshness unknown';
  return null;
}

function ActivityRow({ row }: Readonly<{ readonly row: OvieActivityRow }>) {
  const stale = freshnessLabel(row);
  const body = (
    <>
      <div className='flex min-h-6 items-start justify-between gap-2'>
        <p className='min-w-0 flex-1 truncate text-app font-medium text-primary-token'>
          {row.linearId ? (
            <span className='font-normal text-tertiary-token'>
              {row.linearId}{' '}
            </span>
          ) : null}
          {row.title}
        </p>
        <HudStatusPill label={row.stateLabel} tone={stateTone(row.state)} />
      </div>
      <p className='mt-1 truncate text-2xs text-tertiary-token'>
        {row.actor}
        {row.detail ? ` · ${row.detail}` : ''}
        {row.receipt ? ` · receipt ${row.receipt}` : ''}
        {stale ? ` · ${stale}` : ''}
      </p>
    </>
  );

  if (!row.href) {
    return <li className='rounded-lg px-2 py-2'>{body}</li>;
  }
  return (
    <li>
      <a
        className='block rounded-lg px-2 py-2 text-left outline-none transition-colors duration-subtle hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset'
        href={row.href}
        rel='noreferrer'
        target={row.href.startsWith('/') ? undefined : '_blank'}
      >
        {body}
      </a>
    </li>
  );
}

export function OvieActivityFeedView({
  rows,
  observation,
}: Readonly<{
  readonly rows: readonly OvieActivityRow[];
  readonly observation: 'ok' | 'empty' | 'unavailable';
}>) {
  return (
    <ContentSurfaceCard
      surface='details'
      className='overflow-hidden'
      data-testid='ovie-activity-feed'
    >
      <div className='flex min-h-10 items-center justify-between gap-3 border-b border-subtle px-3 py-2'>
        <p className='truncate text-2xs font-semibold tracking-normal text-tertiary-token'>
          Company activity
        </p>
        <span className='shrink-0 text-2xs font-medium text-secondary-token'>
          Linear ledger · runtime · GitHub · receipts · public digest
        </span>
      </div>
      <div className='p-2'>
        {observation === 'ok' ? (
          <ol className='grid max-h-80 gap-1 overflow-auto pr-1'>
            {rows.map(row => (
              <ActivityRow key={row.id} row={row} />
            ))}
          </ol>
        ) : (
          <div className='flex min-h-24 items-center px-2 text-app leading-5 text-secondary-token'>
            {observation === 'unavailable'
              ? 'Company activity sources unavailable.'
              : 'No verified company activity yet.'}
          </div>
        )}
      </div>
    </ContentSurfaceCard>
  );
}

export function OvieActivityFeed({
  sources,
  kioskToken = null,
}: Readonly<{
  readonly sources: OvieActivitySources;
  readonly kioskToken?: string | null;
}>) {
  const query = useHudShippingStateQuery(kioskToken);
  const rows = composeOvieActivityRows({
    taskFeed: query.operationalTasks,
    sources,
  });
  const sourcesAvailable =
    sources.landedPullRequests.length > 0 ||
    sources.receiptedShips.length > 0 ||
    sources.publicDigest.length > 0;
  const observation = observeOvieActivityFeed({
    rows,
    taskFeed: query.operationalTasks,
    taskRequestFailed: query.operationalRequestState === 'error',
    sourcesAvailable,
  });
  return <OvieActivityFeedView rows={rows} observation={observation} />;
}
