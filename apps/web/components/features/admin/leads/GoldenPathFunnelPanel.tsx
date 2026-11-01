import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import type {
  DurationSummary,
  GoldenPathCohortReport,
  GoldenPathReport,
} from '@/lib/acquisition/artist-offer-funnel';

const STAGE_LABELS: Record<string, string> = {
  visit: 'Entered',
  start: 'Opened /start',
  'sign-in': 'Signed in',
  claimed: 'Page claimed',
  'upgrade-viewed': 'Upgrade viewed',
  checkout: 'Checkout started',
  paid: 'Paid',
};

const COHORT_LABELS: Record<GoldenPathCohortReport['cohort'], string> = {
  all: 'All consented visits',
  claim_link: 'Opened a claim link',
};

/** Null means the stage before had no journeys, so there is no rate yet. */
function pct(value: number | null): string {
  return value === null ? 'No base' : `${(value * 100).toFixed(1)}%`;
}

function seconds(duration: DurationSummary): string {
  if (duration.samples === 0 || duration.p50 === null) return 'no samples';
  return `p50 ${duration.p50}s, p95 ${duration.p95}s (n=${duration.samples})`;
}

function CohortTable({
  cohort,
  minSample,
}: Readonly<{ cohort: GoldenPathCohortReport; minSample: number }>) {
  return (
    <div className='min-w-0'>
      <h3 className='text-balance text-app font-semibold text-primary-token'>
        {COHORT_LABELS[cohort.cohort]}
      </h3>
      {cohort.underpowered ? (
        <p className='mt-1 text-app text-secondary-token'>
          {cohort.entered} entered, below the {minSample} needed to read a rate.
          Counts are real, conversions are not yet a result.
        </p>
      ) : null}
      <ul className='mt-2 divide-y divide-subtle text-app'>
        {cohort.stages.map(stage => (
          <li
            key={stage.stage}
            className='flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5'
          >
            <span className='w-40 shrink-0 text-primary-token'>
              {STAGE_LABELS[stage.stage] ?? stage.stage}
            </span>
            <span className='w-14 shrink-0 tabular-nums'>{stage.journeys}</span>
            <span className='w-16 shrink-0 tabular-nums text-secondary-token'>
              {stage.stage === 'visit' ? '' : pct(stage.conversionFromPrevious)}
            </span>
            <span className='min-w-0 flex-1 text-secondary-token'>
              {stage.stage === 'visit'
                ? ''
                : seconds(stage.fromPreviousSeconds)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Golden-path conversion: claim link or landing through paid, 28 days. */
export function GoldenPathFunnelPanel({
  report,
}: Readonly<{ report: GoldenPathReport | null }>) {
  return (
    <ContentSurfaceCard surface='details'>
      <div className='space-y-4 p-3' data-testid='golden-path-funnel'>
        <div>
          <h2 className='text-balance text-app font-semibold text-primary-token'>
            Golden Path Conversion
          </h2>
          <p className='mt-1 text-app text-secondary-token'>
            One consented journey from entry to paid, last 28 days. Time is
            measured between stages.
          </p>
        </div>
        {report ? (
          <>
            {report.cohorts.map(cohort => (
              <CohortTable
                key={cohort.cohort}
                cohort={cohort}
                minSample={report.minSample}
              />
            ))}
            {report.stalledStages.length > 0 ? (
              <p role='alert' className='text-app text-accent-red'>
                No events this week despite upstream traffic:{' '}
                {report.stalledStages
                  .map(stage => STAGE_LABELS[stage] ?? stage)
                  .join(', ')}
                . The step is broken or not instrumented.
              </p>
            ) : null}
            {report.uninstrumented.length > 0 ? (
              <p className='text-app text-secondary-token'>
                Not measured yet: {report.uninstrumented.join(', ')}.
              </p>
            ) : null}
          </>
        ) : (
          <p className='text-app text-secondary-token'>
            The funnel could not be read. Check the artist-offer funnel report.
          </p>
        )}
      </div>
    </ContentSurfaceCard>
  );
}
