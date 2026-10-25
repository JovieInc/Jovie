import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import {
  HomeLoopSection,
  type HomeLoopSectionStatus,
} from '@/components/organisms/home-loop';
import { plainOutcome } from '@/lib/ovie/home/plain-language';
import type { OvieShipRow } from '@/lib/ovie/home/shipping-home';
import type {
  CountMeasurement,
  DeliverySummary,
} from '@/lib/ovie/shipping-state/contract';
import { OvieQuietList, type QuietRow } from './OvieQuietList';

/** The few that matter; everything else is a quiet count. */
const TOP_ROWS = 3;
const MAX_GROUPS = 3;

const measured = (count: CountMeasurement | undefined): number | null =>
  !count || count.state === 'not-measured' ? null : count.value;

const ATTENTION_RANK = { failing: 0, blocked: 1, retrying: 2 } as const;
const STAGE_WORDS: Record<OvieShipRow['stage'], string> = {
  investigating: 'investigating',
  building: 'building',
  tested: 'ready to merge',
  merging: 'merging',
  deployed: 'deployed',
  verified: 'verified',
};

function rank(row: OvieShipRow): number {
  return row.attention ? ATTENTION_RANK[row.attention] : 3;
}

function secondaryOf(row: OvieShipRow): string {
  const state = row.attention
    ? row.attention === 'failing'
      ? 'failing checks'
      : row.attention
    : STAGE_WORDS[row.stage];
  return row.pullRequestNumber ? `#${row.pullRequestNumber} · ${state}` : state;
}

/**
 * Group by meaning, not by raw title: "14 open PRs · 2 failing · 3 ready to
 * merge", then the few rows that matter (failing first). Every figure reads
 * "Unknown" when its source was not measured; an empty pipeline is claimed
 * only from a measured zero (prod once said "No work in flight" over dozens
 * of PRs).
 */
export function summarizeInFlight(
  delivery: DeliverySummary | null,
  rows: readonly OvieShipRow[] | null
) {
  const running = measured(delivery?.lanes.running);
  const slots = measured(delivery?.lanes.slots);
  const queue = measured(delivery?.mergeQueueDepth);
  const inFlight = measured(delivery?.inFlight);
  const listed = rows ?? [];

  const groups: [string, number][] = [
    ['failing', listed.filter(row => row.attention === 'failing').length],
    ['blocked', listed.filter(row => row.attention === 'blocked').length],
    ['retrying', listed.filter(row => row.attention === 'retrying').length],
    [
      'ready to merge',
      listed.filter(row => !row.attention && row.stage === 'tested').length,
    ],
    [
      'merging',
      listed.filter(row => !row.attention && row.stage === 'merging').length,
    ],
  ];
  const groupText = groups
    .filter(([, n]) => n > 0)
    .slice(0, MAX_GROUPS)
    .map(([label, n]) => `${n} ${label}`);

  let headline: string;
  if (inFlight === null)
    headline = listed.length > 0 ? `${listed.length} tracked` : 'Unknown';
  else
    headline = [
      `${inFlight} open ${inFlight === 1 ? 'PR' : 'PRs'}`,
      ...(listed.length > 0 && listed.length < inFlight
        ? [`${listed.length} tracked`]
        : []),
      ...groupText,
    ].join(' · ');

  const facts = [
    running === null || slots === null
      ? 'Lanes unknown'
      : `${running} of ${slots} lanes running`,
    queue === null ? 'Merge queue unknown' : `Merge queue ${queue}`,
  ].join(' · ');

  let note: string | null = null;
  if (listed.length === 0) {
    if (inFlight === null) note = 'Unknown: in-flight work was not measured.';
    else if (inFlight === 0) note = 'No work in flight.';
    else note = 'The list is not available.';
  }

  const ordered = [...listed].sort(
    (a, b) => rank(a) - rank(b) || b.stageIndex - a.stageIndex
  );
  const top: QuietRow[] = ordered.slice(0, TOP_ROWS).map(row => ({
    id: row.id,
    primary: plainOutcome(row.title).text,
    secondary: secondaryOf(row),
    attention: Boolean(row.attention),
    href: row.url,
  }));
  return {
    count: inFlight,
    headline,
    facts,
    note,
    top,
    more: Math.max(0, ordered.length - TOP_ROWS),
  };
}

export function OvieInFlightColumn({
  delivery,
  rows,
  status,
  onRetry,
}: Readonly<{
  delivery: DeliverySummary | null;
  rows: readonly OvieShipRow[] | null;
  status: HomeLoopSectionStatus;
  onRetry?: () => void;
}>) {
  const summary = summarizeInFlight(delivery, rows);
  const unknown = summary.headline === 'Unknown';
  return (
    <HomeLoopSection
      title='In Flight'
      count={summary.count}
      status={status}
      isEmpty={false}
      emptyLabel=''
      errorLabel='Shipping data could not load.'
      onRetry={onRetry}
      skeleton={
        <div className='flex flex-col gap-2'>
          <LoadingSkeleton height='h-4' width='w-1/2' />
          <LoadingSkeleton height='h-4' width='w-2/3' />
        </div>
      }
      minBodyClassName='flex min-h-24 flex-1 flex-col lg:min-h-0'
      className='min-h-0'
      testId='home-loop-inflight-section'
    >
      <div
        className='flex min-h-0 flex-1 flex-col gap-3 overflow-hidden'
        data-testid='ovie-inflight'
      >
        <div className='flex flex-col gap-1'>
          <p
            className={
              unknown
                ? 'text-sm text-tertiary-token'
                : 'text-sm font-medium text-primary-token'
            }
            data-testid='ovie-inflight-headline'
          >
            {summary.headline}
          </p>
          <p
            className='text-xs text-tertiary-token'
            data-testid='ovie-inflight-facts'
          >
            {summary.facts}
          </p>
        </div>
        {summary.note ? (
          <p
            className='text-sm text-secondary-token'
            data-testid='ovie-inflight-note'
          >
            {summary.note}
          </p>
        ) : (
          <OvieQuietList
            rows={summary.top}
            more={summary.more}
            moreLabel='more'
            testId='ovie-inflight-list'
          />
        )}
      </div>
    </HomeLoopSection>
  );
}
