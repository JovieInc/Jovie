import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import {
  HomeLoopSection,
  type HomeLoopSectionStatus,
} from '@/components/organisms/home-loop';
import type { OvieShipRow } from '@/lib/ovie/home/shipping-home';
import type {
  CountMeasurement,
  DeliverySummary,
} from '@/lib/ovie/shipping-state/contract';

const MAX_ROWS = 12;

const measured = (count: CountMeasurement | undefined): number | null =>
  !count || count.state === 'not-measured' ? null : count.value;

/**
 * Lanes, work in flight and the merge queue. Every figure reads "Unknown" when
 * its source was not measured: an empty list is only ever claimed from a
 * measured zero (the prod Home said "No work in flight" over dozens of PRs).
 */
export function summarizeInFlight(
  delivery: DeliverySummary | null,
  rows: readonly OvieShipRow[] | null
) {
  const running = measured(delivery?.lanes.running);
  const slots = measured(delivery?.lanes.slots);
  const queue = measured(delivery?.mergeQueueDepth);
  const inFlight = measured(delivery?.inFlight);
  const lines: { label: string; value: string }[] = [
    {
      label: 'Lanes',
      value:
        running === null || slots === null
          ? 'Unknown'
          : `${running} of ${slots} running`,
    },
    { label: 'Merge Queue', value: queue === null ? 'Unknown' : String(queue) },
    {
      label: 'Open Pull Requests',
      value: inFlight === null ? 'Unknown' : String(inFlight),
    },
  ];
  const listed = rows ?? [];
  let note: string | null = null;
  if (listed.length === 0) {
    if (inFlight === null) note = 'Unknown: in-flight work was not measured.';
    else if (inFlight === 0) note = 'No work in flight.';
    else note = `${inFlight} in flight; the list is not available.`;
  }
  return {
    count: inFlight,
    lines,
    note,
    shown: listed.slice(0, MAX_ROWS),
    more: Math.max(0, listed.length - MAX_ROWS),
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
        className='flex min-h-0 flex-1 flex-col gap-2 overflow-hidden'
        data-testid='ovie-inflight'
      >
        <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm'>
          {summary.lines.map(line => (
            <div key={line.label} className='contents'>
              <dt className='text-tertiary-token'>{line.label}</dt>
              <dd
                className={
                  line.value === 'Unknown'
                    ? 'text-tertiary-token'
                    : 'font-medium text-primary-token'
                }
              >
                {line.value}
              </dd>
            </div>
          ))}
        </dl>
        {summary.note ? (
          <p
            className='text-sm text-secondary-token'
            data-testid='ovie-inflight-note'
          >
            {summary.note}
          </p>
        ) : (
          <ul className='flex min-h-0 flex-col gap-1 overflow-hidden text-sm'>
            {summary.shown.map(row => (
              <li key={row.id} className='flex gap-2'>
                <span className='shrink-0 text-tertiary-token'>
                  {row.pullRequestNumber
                    ? `#${row.pullRequestNumber}`
                    : row.identifier}
                </span>
                <span className='min-w-0 text-secondary-token'>
                  {row.title}
                </span>
              </li>
            ))}
            {summary.more > 0 ? (
              <li
                className='text-tertiary-token'
                data-testid='ovie-inflight-more'
              >{`+${summary.more} more`}</li>
            ) : null}
          </ul>
        )}
      </div>
    </HomeLoopSection>
  );
}
