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

function pct(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
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
      <h3 className='text-app font-semibold text-primary-token'>
        {COHORT_LABELS[cohort.cohort]}
      </h3>
      {cohort.underpowered ? (
        <p className='mt-1 text-app text-secondary-token'>
          {cohort.entered} entered, below the {minSample} needed to read a rate.
          Counts are real, conversions are not yet a result.
        </p>
      ) : null}
      <table className='mt-2 w-full text-left text-app'>
        <thead className='text-secondary-token'>
          <tr>
            <th className='py-1 pr-3 font-medium'>Stage</th>
            <th className='py-1 pr-3 font-medium'>Journeys</th>
            <th className='py-1 pr-3 font-medium'>From previous</th>
            <th className='py-1 font-medium'>Time from previous</th>
          </tr>
        </thead>
        <tbody>
          {cohort.stages.map(stage => (
            <tr key={stage.stage} className='border-t border-subtle'>
              <td className='py-1 pr-3 text-primary-token'>
                {STAGE_LABELS[stage.stage] ?? stage.stage}
              </td>
              <td className='py-1 pr-3 tabular-nums'>{stage.journeys}</td>
              <td className='py-1 pr-3 tabular-nums'>
                {stage.stage === 'visit'
                  ? ''
                  : pct(stage.conversionFromPrevious)}
              </td>
              <td className='py-1 text-secondary-token'>
                {stage.stage === 'visit'
                  ? ''
                  : seconds(stage.fromPreviousSeconds)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
          <h2 className='text-app font-semibold text-primary-token'>
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
