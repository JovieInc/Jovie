import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  type DetectionCoverageSnapshot,
  getDetectionCoverageSnapshot,
} from '@/lib/hud/detection-coverage';

interface HudDetectionCoveragePanelProps {
  readonly snapshot?: DetectionCoverageSnapshot;
}

function formatRate(value: number | null): string {
  return value === null ? 'Not measured' : `${Math.round(value * 100)}%`;
}

function formatMinutes(value: number | null): string {
  if (value === null) return 'Not measured';
  const minutes = Math.round(value);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function trendCopy(
  trend: DetectionCoverageSnapshot['founderRescueTrend'],
  previous: string
): string {
  if (trend === 'unknown') return 'Awaiting a second measured window';
  const direction = trend === 'down' ? 'Down' : trend === 'up' ? 'Up' : 'Flat';
  return `${direction} from ${previous}`;
}

function Metric({
  label,
  value,
  detail,
}: Readonly<{
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}>) {
  return (
    <div className='min-w-0 border-t border-subtle pt-2'>
      <p className='text-2xs font-medium text-tertiary-token'>{label}</p>
      <p className='mt-1 text-lg font-semibold tabular-nums text-primary-token'>
        {value}
      </p>
      <p className='mt-0.5 text-2xs leading-4 text-tertiary-token'>{detail}</p>
    </div>
  );
}

export function HudDetectionCoveragePanel({
  snapshot = getDetectionCoverageSnapshot(),
}: HudDetectionCoveragePanelProps) {
  const next = snapshot.nextCapability;

  return (
    <ContentSurfaceCard
      surface='details'
      data-testid='hud-detection-coverage-panel'
    >
      <div className='space-y-3 p-3'>
        <div className='grid gap-3 sm:grid-cols-3'>
          <Metric
            label='Detector Coverage'
            value={`${snapshot.covered} / ${snapshot.total}`}
            detail='Red + control + live firing required'
          />
          <Metric
            label='Founder Rescue Rate'
            value={formatRate(snapshot.founderRescueRate)}
            detail={trendCopy(
              snapshot.founderRescueTrend,
              formatRate(snapshot.founderRescueRatePrevious)
            )}
          />
          <Metric
            label='Median Failure → Detection'
            value={formatMinutes(snapshot.medianDetectionMinutes)}
            detail={trendCopy(
              snapshot.medianDetectionTrend,
              formatMinutes(snapshot.medianDetectionMinutesPrevious)
            )}
          />
        </div>

        <div className='border-t border-subtle pt-3'>
          <p className='text-2xs font-medium text-tertiary-token'>
            Next Highest-Value Capability
          </p>
          {next ? (
            <>
              <div className='mt-1 flex items-baseline justify-between gap-3'>
                <p className='text-app font-semibold text-primary-token'>
                  {next.title}
                </p>
                <p className='shrink-0 text-2xs tabular-nums text-secondary-token'>
                  Score {next.score}
                </p>
              </div>
              <p className='mt-1 text-2xs leading-4 text-secondary-token'>
                {next.nextExpansion}
              </p>
            </>
          ) : (
            <p className='mt-1 text-app text-secondary-token'>
              Every registered capability is live-verified.
            </p>
          )}
        </div>

        <div className='grid gap-3 border-t border-subtle pt-3 md:grid-cols-2'>
          <div>
            <p className='text-2xs font-medium text-tertiary-token'>
              Recent Blind Spots
            </p>
            <ul className='mt-2 space-y-2'>
              {snapshot.blindSpots.map(item => (
                <li key={`${item.capability}:${item.summary}`}>
                  <p className='text-2xs font-medium text-secondary-token'>
                    {item.capability}
                  </p>
                  <p className='text-2xs leading-4 text-tertiary-token'>
                    {item.summary}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className='text-2xs font-medium text-tertiary-token'>
              Recent Founder Rescues
            </p>
            <ul className='mt-2 space-y-2'>
              {snapshot.recentFounderRescues.map(item => (
                <li key={item.id}>
                  <p className='text-2xs font-medium text-secondary-token'>
                    {item.id}
                  </p>
                  <p className='text-2xs leading-4 text-tertiary-token'>
                    {item.summary}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </ContentSurfaceCard>
  );
}
