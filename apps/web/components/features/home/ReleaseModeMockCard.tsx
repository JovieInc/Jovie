import { cn } from '@/lib/utils';
import { HomepageLabelLogoMark } from './HomepageLabelLogoMark';
import type { HomepageReleaseMock } from './home-surface-seed';
import { MarketingSurfaceCard } from './MarketingSurfaceCard';

const ARTWORK_TONE_CLASS_NAMES = {
  violet:
    'bg-[linear-gradient(160deg,rgba(121,80,242,0.96),rgba(46,18,94,0.98))]',
  blue: 'bg-[linear-gradient(160deg,rgba(59,130,246,0.96),rgba(14,25,68,0.98))]',
} as const;

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
      className={cn(
        'relative overflow-hidden rounded-[1.1rem] border border-white/10 shadow-[0_16px_36px_rgba(0,0,0,0.28)]',
        ARTWORK_TONE_CLASS_NAMES[tone]
      )}
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.24),transparent_38%),linear-gradient(180deg,transparent_30%,rgba(5,7,13,0.42))]'
      />
      <div
        aria-hidden='true'
        className='pointer-events-none absolute -left-5 top-8 h-20 w-20 rounded-full border border-white/16'
      />
      <div
        aria-hidden='true'
        className='pointer-events-none absolute -right-4 bottom-5 h-16 w-16 rounded-full bg-white/10 blur-sm'
      />
      <div className='relative flex h-full min-h-[7rem] flex-col justify-between p-3'>
        <span className='text-[10px] font-medium text-white/72'>Single</span>
        <div className={cn(compact && 'max-w-[9rem]')}>
          <p className='text-[14px] font-semibold tracking-[-0.02em] text-white'>
            {title}
          </p>
          {compact ? null : (
            <p className='mt-1 text-[10px] leading-4 text-white/72'>{artist}</p>
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
  const statePillClassName =
    release.state === 'presave'
      ? 'border-violet-400/20 bg-violet-400/10 text-violet-100/88'
      : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100/88';
  const stateLabel = release.state === 'presave' ? 'Presave' : 'Live';
  const visibleLabels = isCompact ? release.labels.slice(0, 3) : release.labels;
  const stateMetaLabel = release.state === 'presave' ? 'Countdown' : 'Status';
  const aspectRatio = getAspectRatio(variant);

  return (
    <MarketingSurfaceCard
      testId={testId}
      aspectRatio={aspectRatio}
      variant={isCompact ? 'floating' : 'panel'}
      glowTone={release.artworkTone}
      className={cn('h-full', className)}
    >
      <div className='relative flex h-full flex-col p-4'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <p className='text-[10px] font-medium tracking-[0.02em] text-white/42'>
              Smart Link
            </p>
            <p className='mt-1 text-[11px] text-white/34'>
              {release.modeLabel}
            </p>
          </div>
          <span
            className={cn(
              'rounded-full border px-2.5 py-1 text-[10px] font-medium',
              statePillClassName
            )}
          >
            {stateLabel}
          </span>
        </div>

        <div
          className={cn(
            'mt-4',
            isCompact || isComparison
              ? 'space-y-3'
              : 'grid flex-1 gap-4 md:grid-cols-[12rem_minmax(0,1fr)]'
          )}
        >
          <div
            className={cn(
              isCompact || isComparison ? '' : 'flex h-full flex-col'
            )}
          >
            <ReleaseArtwork
              title={release.title}
              artist={release.artist}
              tone={release.artworkTone}
              compact={isCompact || isComparison}
            />
            <div className='mt-3 flex items-center justify-between gap-3 text-[11px] leading-5 text-white/44'>
              <p>{release.artist}</p>
              <p className='text-right'>{release.releaseLabel}</p>
            </div>
          </div>

          <div className='flex min-h-0 flex-1 flex-col'>
            <div
              className={cn(
                'grid grid-cols-2 gap-2 border-y border-white/6 py-3',
                (isCompact || isComparison) && 'py-2.5'
              )}
            >
              <div className='rounded-[0.95rem] border border-white/7 bg-white/[0.03] px-3 py-2.5'>
                <p className='text-[10px] text-white/36'>
                  {release.primaryMetricLabel}
                </p>
                <p
                  className={cn(
                    'mt-1 font-[580] tracking-[-0.03em] text-white',
                    isComparison ? 'text-[20px]' : 'text-[22px]'
                  )}
                >
                  {release.primaryMetricValue}
                </p>
              </div>
              <div className='rounded-[0.95rem] border border-white/7 bg-white/[0.03] px-3 py-2.5'>
                <p className='text-[10px] text-white/36'>
                  {release.secondaryMetricLabel}
                </p>
                <p
                  className={cn(
                    'mt-1 font-[580] tracking-[-0.03em] text-white',
                    isComparison ? 'text-[20px]' : 'text-[22px]'
                  )}
                >
                  {release.secondaryMetricValue}
                </p>
              </div>
            </div>

            <div
              className={cn(
                'mt-3 flex items-center justify-between gap-3 rounded-[0.95rem] px-3 py-2.5',
                isComparison
                  ? 'border border-white/6 bg-white/[0.02]'
                  : 'border border-white/8 bg-white/[0.03]'
              )}
            >
              <div>
                <p className='text-[10px] font-medium tracking-[0.02em] text-white/40'>
                  {stateMetaLabel}
                </p>
                <p className='mt-1 text-[12px] text-white/82'>
                  {release.stateDetail}
                </p>
              </div>
              <div className='h-1.5 w-16 overflow-hidden rounded-full bg-white/10'>
                <div
                  className={cn(
                    'h-full rounded-full',
                    release.state === 'presave'
                      ? 'w-[58%] bg-violet-300'
                      : 'w-full bg-emerald-300'
                  )}
                />
              </div>
            </div>

            {isComparison ? (
              <div className='mt-4 border-t border-white/6 pt-3'>
                <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
                  {visibleLabels.map(label => (
                    <HomepageLabelLogoMark
                      key={`${release.id}-${label}`}
                      partner={label}
                      className='text-white/68'
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className='mt-3 rounded-[0.95rem] border border-white/8 bg-white/[0.03] px-3 py-3'>
                <p className='text-[10px] font-medium tracking-[0.02em] text-white/40'>
                  Label Partners
                </p>
                <div className='mt-3 flex flex-wrap items-center gap-x-4 gap-y-3'>
                  {visibleLabels.map(label => (
                    <HomepageLabelLogoMark
                      key={`${release.id}-${label}`}
                      partner={label}
                      className='text-white/72'
                    />
                  ))}
                </div>
              </div>
            )}

            {isCompact && release.labels.length > visibleLabels.length ? (
              <p className='mt-3 text-[10px] text-white/34'>
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
