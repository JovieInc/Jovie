'use client';

import { Icon } from '@/components/atoms/Icon';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { PageShell } from '@/components/organisms/PageShell';
import { PageToolbar } from '@/components/organisms/table';
import { computeRatePercent } from '@/lib/analytics/metrics';
import type {
  ExperimentRecord,
  ExperimentStatus,
  QuotaUsage,
  RevivalCandidate,
  RevivalFlag,
} from '@/lib/services/youtube-revival/types';

// ---------------------------------------------------------------------------
// Flag display helpers
// ---------------------------------------------------------------------------

const FLAG_LABELS: Record<RevivalFlag, string> = {
  ctr_below_median: 'CTR below median',
  watch_min_per_impression_below_baseline: 'Low watch-time',
  high_impressions_low_views: 'High impressions / low views',
  evergreen_declining_reach: 'Evergreen reach declining',
};

// ---------------------------------------------------------------------------
// Experiment status helpers
// ---------------------------------------------------------------------------

const EXPERIMENT_STATUS_LABEL: Record<ExperimentStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  concluded_winner: 'Winner found',
  concluded_no_winner: 'No winner',
  rolled_back: 'Rolled back',
};

const EXPERIMENT_STATUS_ACCENT: Record<ExperimentStatus, string> = {
  pending: 'text-tertiary-token',
  running: 'text-accent-blue',
  concluded_winner: 'text-accent-green',
  concluded_no_winner: 'text-secondary-token',
  rolled_back: 'text-accent-red',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface RevivalCandidateCardProps {
  readonly candidate: RevivalCandidate;
}

function RevivalCandidateCard({ candidate }: RevivalCandidateCardProps) {
  const ctrPct = (candidate.metrics.ctr * 100).toFixed(1);
  const wmpI = candidate.metrics.watchMinPerImpression.toFixed(2);
  const trendSign =
    candidate.metrics.reachTrend >= 0
      ? `+${(candidate.metrics.reachTrend * 100).toFixed(0)}%`
      : `${(candidate.metrics.reachTrend * 100).toFixed(0)}%`;

  return (
    <ContentSurfaceCard className='p-4'>
      <div className='flex items-start gap-3'>
        {/* Thumbnail or placeholder */}
        {candidate.thumbnailUrl ? (
          // ponytail: plain img avoids next/image dependency; thumbnails are external YouTube URLs
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={candidate.thumbnailUrl}
            alt=''
            aria-hidden='true'
            className='h-14 w-24 shrink-0 rounded-md object-cover'
          />
        ) : (
          <div className='flex h-14 w-24 shrink-0 items-center justify-center rounded-md bg-surface-0'>
            <Icon name='Film' className='h-5 w-5 text-tertiary-token' />
          </div>
        )}

        <div className='min-w-0 flex-1'>
          <h3 className='truncate text-app font-semibold text-primary-token'>
            {candidate.title}
          </h3>

          {/* Flags */}
          <div className='mt-1.5 flex flex-wrap gap-1'>
            {candidate.flags.map(flag => (
              <span
                key={flag}
                className='inline-flex items-center rounded-full border border-subtle bg-surface-0 px-2 py-0.5 text-xs text-secondary-token'
              >
                {FLAG_LABELS[flag]}
              </span>
            ))}
          </div>

          {/* Key metrics */}
          <div className='mt-2 flex flex-wrap gap-4 text-xs text-tertiary-token'>
            <span>
              <span className='font-medium text-secondary-token'>CTR</span>{' '}
              {ctrPct}%
            </span>
            <span>
              <span className='font-medium text-secondary-token'>
                Watch-min/impression
              </span>{' '}
              {wmpI}
            </span>
            <span>
              <span className='font-medium text-secondary-token'>Reach</span>{' '}
              {trendSign}
            </span>
            <span>
              <span className='font-medium text-secondary-token'>
                Impressions
              </span>{' '}
              {candidate.metrics.impressions.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Opportunity score badge */}
        <div className='shrink-0 text-right'>
          <span className='text-lg font-bold tabular-nums text-primary-token'>
            {candidate.opportunityScore}
          </span>
          <p className='text-xs text-tertiary-token'>/ 100</p>
        </div>
      </div>

      {/* Challenger sets */}
      {candidate.challengers.length > 0 && (
        <div className='mt-3 space-y-2 border-t border-subtle pt-3'>
          <p className='text-xs font-medium text-secondary-token'>
            Recommended experiments
          </p>
          {candidate.challengers.map(c => (
            <div
              key={c.packagingElement}
              className='rounded-md bg-surface-0 px-3 py-2'
            >
              <p className='text-xs font-medium text-primary-token'>
                {c.hypothesis}
              </p>
              <p className='mt-0.5 text-xs text-tertiary-token'>
                {c.rationale}
              </p>
            </div>
          ))}
        </div>
      )}
    </ContentSurfaceCard>
  );
}

interface ExperimentRowProps {
  readonly experiment: ExperimentRecord;
}

function ExperimentRow({ experiment }: ExperimentRowProps) {
  const ctrDelta = (
    (experiment.challenger.ctr - experiment.baseline.ctr) *
    100
  ).toFixed(2);
  const wmpIDelta = (
    experiment.challenger.watchMinPerImpression -
    experiment.baseline.watchMinPerImpression
  ).toFixed(3);

  return (
    <div className='flex items-center gap-3 border-b border-subtle px-4 py-3 last:border-b-0'>
      <div className='min-w-0 flex-1'>
        <p className='truncate text-app text-primary-token'>
          {experiment.videoTitle}
        </p>
        <p className='text-xs text-tertiary-token'>
          CTR Δ {Number(ctrDelta) >= 0 ? `+${ctrDelta}` : ctrDelta}% · WmpI Δ{' '}
          {Number(wmpIDelta) >= 0 ? `+${wmpIDelta}` : wmpIDelta}
        </p>
      </div>
      <span
        className={`text-xs font-medium ${EXPERIMENT_STATUS_ACCENT[experiment.status] ?? 'text-secondary-token'}`}
      >
        {EXPERIMENT_STATUS_LABEL[experiment.status] ?? experiment.status}
      </span>
    </div>
  );
}

interface QuotaBarProps {
  readonly quota: QuotaUsage;
}

function QuotaBar({ quota }: QuotaBarProps) {
  const pct = Math.min(
    100,
    computeRatePercent(quota.usedToday, quota.dailyCap, 0)
  );
  const isNearCap = pct >= 80;

  return (
    <ContentSurfaceCard className='px-4 py-3'>
      <div className='flex items-center justify-between text-xs'>
        <span className='font-medium text-secondary-token'>
          thumbnails.set quota
        </span>
        <span
          className={`font-medium tabular-nums ${isNearCap ? 'text-accent-orange' : 'text-primary-token'}`}
        >
          {quota.usedToday.toLocaleString()} / {quota.dailyCap.toLocaleString()}{' '}
          units
        </span>
      </div>
      <div className='mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-0'>
        <div
          className={`h-full rounded-full transition-[width] duration-subtle ${isNearCap ? 'bg-accent-orange' : 'bg-accent-blue'}`}
          style={{ width: `${pct}%` }}
          role='progressbar'
          aria-valuenow={quota.usedToday}
          aria-valuemax={quota.dailyCap}
          aria-label='Quota Used Today'
        />
      </div>
      <p className='mt-1.5 text-xs text-tertiary-token'>
        {quota.swapsToday} of {quota.maxSwapsPerDay} swaps used today
      </p>
    </ContentSurfaceCard>
  );
}

// ---------------------------------------------------------------------------
// Empty / unconnected state
// ---------------------------------------------------------------------------

function NotConnectedState() {
  return (
    <ContentSurfaceCard className='flex flex-col items-center justify-center px-6 py-10 text-center'>
      <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-surface-0'>
        <Icon name='Youtube' className='h-5 w-5 text-tertiary-token' />
      </div>
      <h3 className='mt-3 text-app font-semibold text-primary-token'>
        Connect Your YouTube Channel
      </h3>
      <p className='mt-1 max-w-sm text-app text-secondary-token leading-snug'>
        The revival queue needs your YouTube analytics. Connect your channel in
        Settings to start identifying packaging opportunities.
      </p>
    </ContentSurfaceCard>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export interface RevivalQueuePanelProps {
  readonly candidates: RevivalCandidate[];
  readonly experiments: ExperimentRecord[];
  readonly quota: QuotaUsage | null;
  /** True when the YouTube connector is set up */
  readonly isConnected: boolean;
  readonly testId?: string;
}

export function RevivalQueuePanel({
  candidates,
  experiments,
  quota,
  isConnected,
  testId = 'youtube-revival-queue',
}: RevivalQueuePanelProps) {
  const toolbar = (
    <PageToolbar
      start={
        <span className='text-xs text-tertiary-token'>
          {isConnected
            ? `${candidates.length} candidate${candidates.length !== 1 ? 's' : ''}`
            : null}
        </span>
      }
      end={null}
    />
  );

  return (
    <PageShell toolbar={toolbar} data-testid={testId}>
      <div className='min-h-0 flex-1 overflow-y-auto overflow-x-hidden'>
        <div className='flex flex-col gap-6 px-3 py-2.5 sm:px-4 sm:py-3.5'>
          {!isConnected ? (
            <NotConnectedState />
          ) : (
            <>
              {/* Quota bar */}
              {quota && <QuotaBar quota={quota} />}

              {/* Revival queue */}
              <section aria-labelledby='revival-queue-heading'>
                <h2
                  id='revival-queue-heading'
                  className='mb-3 text-app font-caption tracking-normal text-secondary-token'
                >
                  Revival Candidates
                </h2>
                {candidates.length === 0 ? (
                  <ContentSurfaceCard className='px-4 py-6 text-center'>
                    <p className='text-app text-secondary-token'>
                      No underperforming videos found. All videos are meeting
                      channel baselines.
                    </p>
                  </ContentSurfaceCard>
                ) : (
                  <div className='space-y-3'>
                    {candidates.map(c => (
                      <RevivalCandidateCard key={c.videoId} candidate={c} />
                    ))}
                  </div>
                )}
              </section>

              {/* Experiments dashboard */}
              {experiments.length > 0 && (
                <section aria-labelledby='experiments-heading'>
                  <h2
                    id='experiments-heading'
                    className='mb-3 text-app font-caption tracking-normal text-secondary-token'
                  >
                    Experiments
                  </h2>
                  <ContentSurfaceCard className='divide-y divide-subtle p-0'>
                    {experiments.map(exp => (
                      <ExperimentRow key={exp.experimentId} experiment={exp} />
                    ))}
                  </ContentSurfaceCard>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
