import { MarketingSurfaceCard } from '@/components/marketing/MarketingSurfaceCard';
import { cn } from '@/lib/utils';
import { HomepageLabelLogoMark } from './HomepageLabelLogoMark';
import type { HomepageReleaseMock } from './home-surface-seed';

interface ReleaseModeMockCardProps {
  readonly release: HomepageReleaseMock;
  readonly variant: 'compact' | 'feature' | 'comparison';
  readonly testId?: string;
  readonly className?: string;
}

function ReleaseArtwork({
  title,
  artist,
  tone,
  compact = false,
}: Readonly<{
  title: string;
  artist: string;
  tone: HomepageReleaseMock['artworkTone'];
  compact?: boolean;
}>) {
  return (
    <div
      className='system-b-release-mode-artwork'
      data-compact={compact ? 'true' : 'false'}
      data-tone={tone}
    >
      <div aria-hidden='true' className='system-b-release-mode-artwork-field' />
      <div aria-hidden='true' className='system-b-release-mode-artwork-orbit' />
      <div aria-hidden='true' className='system-b-release-mode-artwork-node' />
      <div className='system-b-release-mode-artwork-content'>
        <span className='system-b-release-mode-artwork-kicker'>Single</span>
        <div
          className='system-b-release-mode-artwork-copy'
          data-compact={compact ? 'true' : 'false'}
        >
          <p className='system-b-release-mode-artwork-title'>{title}</p>
          {compact ? null : (
            <p className='system-b-release-mode-artwork-artist'>{artist}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function getAspectRatio(variant: ReleaseModeMockCardProps['variant']): string {
  if (variant === 'compact') return '9 / 16';
  if (variant === 'comparison') return '11 / 13';
  return '16 / 10';
}

export function ReleaseModeMockCard({
  release,
  variant,
  testId,
  className,
}: Readonly<ReleaseModeMockCardProps>) {
  const isCompact = variant === 'compact';
  const isComparison = variant === 'comparison';
  const stateLabel = release.state === 'presave' ? 'Presave' : 'Live';
  const visibleLabels = isCompact ? release.labels.slice(0, 3) : release.labels;
  const stateMetaLabel = release.state === 'presave' ? 'Countdown' : 'Status';
  const aspectRatio = getAspectRatio(variant);
  const bodyLayout = isCompact || isComparison ? 'stack' : 'split';

  return (
    <MarketingSurfaceCard
      testId={testId}
      aspectRatio={aspectRatio}
      variant={isCompact ? 'floating' : 'panel'}
      glowTone={release.artworkTone}
      className={cn('h-full', className)}
    >
      <div className='system-b-release-mode-card'>
        <div className='system-b-release-mode-header'>
          <div className='system-b-release-mode-header-copy'>
            <p className='system-b-release-mode-kicker'>Smart Link</p>
            <p className='system-b-release-mode-subtitle'>
              {release.modeLabel}
            </p>
          </div>
          <span
            className='system-b-release-mode-state-pill'
            data-state={release.state}
          >
            {stateLabel}
          </span>
        </div>

        <div className='system-b-release-mode-body' data-layout={bodyLayout}>
          <div
            className='system-b-release-mode-artwork-column'
            data-layout={bodyLayout}
          >
            <ReleaseArtwork
              title={release.title}
              artist={release.artist}
              tone={release.artworkTone}
              compact={isCompact || isComparison}
            />
            <div className='system-b-release-mode-release-meta'>
              <p>{release.artist}</p>
              <p>{release.releaseLabel}</p>
            </div>
          </div>

          <div className='system-b-release-mode-details'>
            <div
              className='system-b-release-mode-metric-grid'
              data-layout={bodyLayout}
            >
              <div className='system-b-release-mode-metric'>
                <p className='system-b-release-mode-metric-label'>
                  {release.primaryMetricLabel}
                </p>
                <p
                  className='system-b-release-mode-metric-value'
                  data-layout={bodyLayout}
                >
                  {release.primaryMetricValue}
                </p>
              </div>
              <div className='system-b-release-mode-metric'>
                <p className='system-b-release-mode-metric-label'>
                  {release.secondaryMetricLabel}
                </p>
                <p
                  className='system-b-release-mode-metric-value'
                  data-layout={bodyLayout}
                >
                  {release.secondaryMetricValue}
                </p>
              </div>
            </div>

            <div
              className='system-b-release-mode-state-row'
              data-layout={bodyLayout}
            >
              <div>
                <p className='system-b-release-mode-state-label'>
                  {stateMetaLabel}
                </p>
                <p className='system-b-release-mode-state-copy'>
                  {release.stateDetail}
                </p>
              </div>
              <div className='system-b-release-mode-progress-track'>
                <div
                  className='system-b-release-mode-progress-fill'
                  data-state={release.state}
                />
              </div>
            </div>

            {isComparison ? (
              <div className='system-b-release-mode-labels' data-layout='flat'>
                <div className='system-b-release-mode-label-list'>
                  {visibleLabels.map(label => (
                    <HomepageLabelLogoMark
                      key={`${release.id}-${label}`}
                      partner={label}
                      className='system-b-release-mode-label-logo'
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className='system-b-release-mode-labels' data-layout='panel'>
                <p className='system-b-release-mode-label-heading'>
                  Label Partners
                </p>
                <div className='system-b-release-mode-label-list'>
                  {visibleLabels.map(label => (
                    <HomepageLabelLogoMark
                      key={`${release.id}-${label}`}
                      partner={label}
                      className='system-b-release-mode-label-logo'
                    />
                  ))}
                </div>
              </div>
            )}

            {isCompact && release.labels.length > visibleLabels.length ? (
              <p className='system-b-release-mode-overflow-copy'>
                {release.labels.length - visibleLabels.length} more partners in
                the release stack.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </MarketingSurfaceCard>
  );
}
