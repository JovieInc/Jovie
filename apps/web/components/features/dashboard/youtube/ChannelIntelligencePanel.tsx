'use client';

import { Icon } from '@/components/atoms/Icon';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import type {
  ChannelIntelligenceReport,
  ChannelWinSignal,
  RankedVideo,
} from '@/lib/services/channel-intelligence';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatWmpi(value: number): string {
  return value.toFixed(3);
}

function formatCtr(ctr: number): string {
  return `${(ctr * 100).toFixed(1)}%`;
}

function formatTrend(trend: number): string {
  const pct = (trend * 100).toFixed(0);
  return trend >= 0 ? `+${pct}%` : `${pct}%`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface RankedVideoRowProps {
  readonly video: RankedVideo;
  readonly showTrend?: boolean;
}

function RankedVideoRow({ video, showTrend = false }: RankedVideoRowProps) {
  return (
    <div className='flex items-start gap-3 px-4 py-3'>
      {video.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbs
        <img
          src={video.thumbnailUrl}
          alt=''
          aria-hidden='true'
          className='h-12 w-20 shrink-0 rounded-md object-cover'
        />
      ) : (
        <div className='flex h-12 w-20 shrink-0 items-center justify-center rounded-md bg-surface-0'>
          <Icon name='Film' className='h-4 w-4 text-tertiary-token' />
        </div>
      )}

      <div className='min-w-0 flex-1'>
        <p className='truncate text-app font-medium text-primary-token'>
          <span className='mr-1.5 tabular-nums text-tertiary-token'>
            {video.rank}.
          </span>
          {video.title}
        </p>
        <div className='mt-1 flex flex-wrap gap-3 text-xs text-tertiary-token'>
          <span>
            <span className='font-medium text-secondary-token'>
              Watch-min/impression
            </span>{' '}
            {formatWmpi(video.watchMinutesPerImpression)}
          </span>
          <span>
            <span className='font-medium text-secondary-token'>CTR</span>{' '}
            {formatCtr(video.ctr)}
          </span>
          <span>
            <span className='font-medium text-secondary-token'>AVD</span>{' '}
            {Math.round(video.avgViewDurationSeconds)}s
          </span>
          {showTrend ? (
            <span>
              <span className='font-medium text-secondary-token'>Reach</span>{' '}
              {formatTrend(video.reachTrend)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface WinSignalCardProps {
  readonly signal: ChannelWinSignal;
}

function WinSignalCard({ signal }: WinSignalCardProps) {
  return (
    <div className='rounded-md bg-surface-0 px-3 py-2'>
      <p className='text-xs font-medium text-primary-token'>{signal.summary}</p>
      <p className='mt-0.5 text-xs text-tertiary-token'>
        {signal.confidence} confidence · n={signal.sampleSize} ·{' '}
        {signal.source.label}
      </p>
    </div>
  );
}

function NotConnectedState() {
  return (
    <ContentSurfaceCard className='flex flex-col items-center px-4 py-10 text-center'>
      <div className='mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-0'>
        <Icon name='ChartBar' className='h-5 w-5 text-tertiary-token' />
      </div>
      <h3 className='text-app font-semibold text-primary-token'>
        Channel Intelligence
      </h3>
      <p className='mt-1 max-w-sm text-app text-secondary-token leading-snug'>
        Ask Jovie about your best and worst videos once YouTube analytics are
        connected. Rankings use watch-minutes-per-impression, not CTR alone.
      </p>
    </ContentSurfaceCard>
  );
}

function EmptyMetricsState() {
  return (
    <ContentSurfaceCard className='px-4 py-6 text-center'>
      <p className='text-app text-secondary-token'>
        No Reporting API metrics yet. After the connector syncs, videos with at
        least 100 impressions appear here ranked by watch-min/impression.
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
  testId = 'youtube-channel-intelligence',
}: ChannelIntelligencePanelProps) {
  if (!isConnected) {
    return (
      <section
        aria-labelledby='channel-intelligence-heading'
        data-testid={testId}
      >
        <h2
          id='channel-intelligence-heading'
          className='mb-3 text-app font-caption tracking-normal text-secondary-token'
        >
          Channel Intelligence
        </h2>
        <NotConnectedState />
      </section>
    );
  }

  const hasVideos = (report?.videoCount ?? 0) > 0;

  return (
    <section
      aria-labelledby='channel-intelligence-heading'
      data-testid={testId}
      className='space-y-6'
    >
      <div>
        <h2
          id='channel-intelligence-heading'
          className='mb-1 text-app font-caption tracking-normal text-secondary-token'
        >
          Channel Intelligence
        </h2>
        {report ? (
          <p className='text-xs text-tertiary-token'>
            Ranked by watch-min/impression · channel mean{' '}
            {formatWmpi(report.channelMeanWatchMinutesPerImpression)} ·{' '}
            {report.videoCount} video{report.videoCount !== 1 ? 's' : ''}
          </p>
        ) : null}
      </div>

      {!report || !hasVideos ? (
        <EmptyMetricsState />
      ) : (
        <>
          {/* Best videos */}
          <div>
            <h3 className='mb-2 text-xs font-medium text-secondary-token'>
              Best Videos
            </h3>
            {report.bestVideos.length === 0 ? (
              <ContentSurfaceCard className='px-4 py-4 text-center'>
                <p className='text-app text-secondary-token'>
                  No rankable videos yet.
                </p>
              </ContentSurfaceCard>
            ) : (
              <ContentSurfaceCard className='divide-y divide-subtle p-0'>
                {report.bestVideos.map(video => (
                  <RankedVideoRow key={video.videoId} video={video} />
                ))}
              </ContentSurfaceCard>
            )}
          </div>

          {/* What works */}
          {report.winSignals.length > 0 ? (
            <div>
              <h3 className='mb-2 text-xs font-medium text-secondary-token'>
                What Works On This Channel
              </h3>
              <div className='space-y-2'>
                {report.winSignals.map(signal => (
                  <WinSignalCard
                    key={`${signal.dimension}-${signal.winningLabel ?? signal.summary}`}
                    signal={signal}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* Declining */}
          {report.decliningVideos.length > 0 ? (
            <div>
              <h3 className='mb-2 text-xs font-medium text-secondary-token'>
                Declining Reach
              </h3>
              <ContentSurfaceCard className='divide-y divide-subtle p-0'>
                {report.decliningVideos.map(video => (
                  <RankedVideoRow key={video.videoId} video={video} showTrend />
                ))}
              </ContentSurfaceCard>
            </div>
          ) : null}

          {/* Sources footnote */}
          {report.sources.length > 0 ? (
            <p className='text-xs text-tertiary-token'>
              Sources: {report.sources.map(s => s.label).join(' · ')}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
