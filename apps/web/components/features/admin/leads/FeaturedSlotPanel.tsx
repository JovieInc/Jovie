import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { FEATURED_REASONS } from '@/lib/profile/one-right-thing/engine';
import {
  FEATURED_MIN_IMPRESSIONS,
  type FeaturedReportLine,
} from '@/lib/profile/one-right-thing/metrics';

function labelFor(reason: string): string {
  return reason in FEATURED_REASONS
    ? FEATURED_REASONS[reason as keyof typeof FEATURED_REASONS].label
    : reason;
}

/** What the profile featured slot showed, why, and whether it was tapped. */
export function FeaturedSlotPanel({
  report,
}: Readonly<{ report: readonly FeaturedReportLine[] | null }>) {
  return (
    <ContentSurfaceCard surface='details'>
      <div className='space-y-3 p-3' data-testid='featured-slot-panel'>
        <div>
          <h2 className='text-balance text-app font-semibold text-primary-token'>
            Featured Slot
          </h2>
          <p className='mt-1 text-app text-secondary-token'>
            What each profile led with, by reason, last 14 days. Counts only.
            Tap rates appear after {FEATURED_MIN_IMPRESSIONS} impressions.
          </p>
        </div>
        {report === null ? (
          <p className='text-app text-secondary-token'>
            The featured slot counters could not be read.
          </p>
        ) : report.length === 0 ? (
          <p className='text-app text-secondary-token'>
            No featured impressions recorded yet.
          </p>
        ) : (
          <ul className='divide-y divide-subtle text-app'>
            {report.map(line => (
              <li
                key={`${line.kind}-${line.reason}`}
                className='flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5'
              >
                <span className='w-16 shrink-0 text-primary-token'>
                  {line.kind}
                </span>
                <span className='min-w-0 flex-1 text-secondary-token'>
                  {labelFor(line.reason)}
                </span>
                <span className='w-20 shrink-0 tabular-nums'>
                  {line.impressions} shown
                </span>
                <span className='w-16 shrink-0 tabular-nums'>
                  {line.taps} taps
                </span>
                <span className='w-16 shrink-0 tabular-nums text-secondary-token'>
                  {line.tapRate === null
                    ? 'n/a'
                    : `${(line.tapRate * 100).toFixed(1)}%`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ContentSurfaceCard>
  );
}
