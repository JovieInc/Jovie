'use client';

import { Icon } from '@/components/atoms/Icon';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import type {
  ChannelIntelligenceReport,
  CorrelationFinding,
  RankedVideo,
} from '@/lib/services/channel-intelligence';

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatWmpi(value: number): string {
  if (value >= 1) return value.toFixed(2);
  if (value >= 0.01) return value.toFixed(3);
  return value.toFixed(4);
}

function formatLift(lift: number): string {
  const pct = lift * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(0)}%`;
}

function formatTrend(trend: number): string {
  const pct = trend * 100;
  return pct >= 0 ? `+${pct.toFixed(0)}%` : `${pct.toFixed(0)}%`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface RankedVideoRowProps {
  readonly video: RankedVideo;
}

function RankedVideoRow({ video }: RankedVideoRowProps) {
  return (
    <div className='flex items-start gap-3 border-b border-subtle px-4 py-3 last:border-b-0'>
      <span className='w-6 shrink-0 text-xs font-medium tabular-nums text-tertiary-token'>
        {video.rank}
      </span>
      {video.thumbnailUrl ? (
        // External YouTube CDN URLs — plain img matches RevivalQueuePanel
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={video.thumbnailUrl}
          alt=''
          aria-hidden='true'
          className='h-12 w-20 shrink-0 rounded-md object-cover'
        />
      ) : (
        <div className='flex h-12 w-20 shrink-0 items-center justify-center rounded-md bg-surface-0'>
          <Icon name='Disc' className='h-4 w-4 text-tertiary-token' />
        </div>
      )}
      <div className='min-w-0 flex-1'>
        <p className='truncate text-app font-medium text-primary-token'>
          {video.title}
        </p>
        <div className='mt-1 flex flex-wrap gap-3 text-xs text-tertiary-token'>
          <span>
            <span className='font-medium text-secondary-token'>WMPI</span>{' '}
            {formatWmpi(video.watchMinutesPerImpression)}
          </span>
          <span>
            <span className='font-medium text-secondary-token'>CTR</span>{' '}
            {(video.ctr * 100).toFixed(1)}%
          </span>
          <span>
            <span className='font-medium text-secondary-token'>
              Impressions
            </span>{' '}
            {video.impressions.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

interface FindingRowProps {
  readonly finding: CorrelationFinding;
}

function FindingRow({ finding }: FindingRowProps) {
  const positive = finding.liftVsChannel > 0;
  return (
    <div className='flex items-start justify-between gap-3 border-b border-subtle px-4 py-3 last:border-b-0'>
      <div className='min-w-0'>
        <p className='text-app text-primary-token'>{finding.segment}</p>
        <p className='mt-0.5 text-xs text-tertiary-token'>
          n={finding.sampleSize} · {finding.confidence} confidence ·{' '}
          {finding.dimension}
        </p>
      </div>
      <span
        className={`shrink-0 text-xs font-medium tabular-nums ${positive ? 'text-accent-green' : 'text-accent-red'}`}
      >
        {formatLift(finding.liftVsChannel)}
      </span>
    </div>
  );
}

function NotConnectedState() {
  return (
    <ContentSurfaceCard className='flex flex-col items-center justify-center px-6 py-10 text-center'>
      <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-surface-0'>
        <Icon name='ChartBar' className='h-5 w-5 text-tertiary-token' />
      </div>
      <h3 className='mt-3 text-app font-semibold text-primary-token'>
        Channel Intelligence
      </h3>
      <p className='mt-1 max-w-sm text-app text-secondary-token leading-snug'>
        Connect YouTube to rank videos by watch minutes per impression, see what
        packaging correlates with wins on your channel, and ask Jovie what is
        working.
      </p>
    </ContentSurfaceCard>
  );
}

function EmptyReportState() {
  return (
    <ContentSurfaceCard className='px-4 py-6 text-center'>
      <p className='text-app text-secondary-token'>
        Not enough Reporting API data yet. Once videos clear the impression
        floor, rankings and packaging correlations appear here.
      </p>
    </ContentSurfaceCard>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export interface ChannelIntelligencePanelProps {
  readonly report: ChannelIntelligenceReport | null;
  /** True when the YouTube connector is set up */
  readonly isConnected: boolean;
  readonly testId?: string;
}

export function ChannelIntelligencePanel({
  report,
  isConnected,
  testId = 'channel-intelligence-report',
}: ChannelIntelligencePanelProps) {
  return (
    <div className='flex flex-col gap-6' data-testid={testId}>
      {!isConnected ? (
        <NotConnectedState />
      ) : !report || report.videoCount === 0 ? (
        <EmptyReportState />
      ) : (
        <>
          <section aria-labelledby='channel-intel-best-heading'>
            <h2
              id='channel-intel-best-heading'
              className='mb-3 text-app font-caption tracking-normal text-secondary-token'
            >
              Ranked By Watch Minutes Per Impression
            </h2>
            <ContentSurfaceCard className='overflow-hidden p-0'>
              {report.rankedVideos.slice(0, 10).map(video => (
                <RankedVideoRow key={video.videoId} video={video} />
              ))}
            </ContentSurfaceCard>
            <p className='mt-2 text-xs text-tertiary-token'>
              Primary metric is watch minutes per impression (not CTR alone).
              Channel mean WMPI {formatWmpi(report.channelMeanWmpi)}.
            </p>
          </section>

          <section aria-labelledby='channel-intel-works-heading'>
            <h2
              id='channel-intel-works-heading'
              className='mb-3 text-app font-caption tracking-normal text-secondary-token'
            >
              What Works On This Channel
            </h2>
            {report.whatWorks.length === 0 ? (
              <ContentSurfaceCard className='px-4 py-6 text-center'>
                <p className='text-app text-secondary-token'>
                  Need more face / text / topic / length labels before packaging
                  correlations are reliable.
                </p>
              </ContentSurfaceCard>
            ) : (
              <ContentSurfaceCard className='overflow-hidden p-0'>
                {report.whatWorks.map(finding => (
                  <FindingRow key={finding.segmentKey} finding={finding} />
                ))}
              </ContentSurfaceCard>
            )}
          </section>

          <section aria-labelledby='channel-intel-declining-heading'>
            <h2
              id='channel-intel-declining-heading'
              className='mb-3 text-app font-caption tracking-normal text-secondary-token'
            >
              Declining Reach
            </h2>
            {report.declining.length === 0 ? (
              <ContentSurfaceCard className='px-4 py-6 text-center'>
                <p className='text-app text-secondary-token'>
                  No videos currently show a meaningful reach decline.
                </p>
              </ContentSurfaceCard>
            ) : (
              <ContentSurfaceCard className='overflow-hidden p-0'>
                {report.declining.slice(0, 5).map(video => (
                  <div
                    key={video.videoId}
                    className='flex items-center justify-between gap-3 border-b border-subtle px-4 py-3 last:border-b-0'
                  >
                    <p className='min-w-0 truncate text-app text-primary-token'>
                      {video.title}
                    </p>
                    <span className='shrink-0 text-xs font-medium tabular-nums text-accent-red'>
                      {formatTrend(video.reachTrend)}
                    </span>
                  </div>
                ))}
              </ContentSurfaceCard>
            )}
          </section>

          {report.sources.length > 0 && (
            <p className='text-xs text-tertiary-token'>
              Sources: {report.sources.map(s => s.label).join(' · ')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
