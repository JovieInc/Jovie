import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  buildGithubHeadroomTile,
  type HeadroomReport,
  type HeadroomTone,
} from '@/lib/ovie/home/github-headroom';
import { cn } from '@/lib/utils';

const DOT: Record<HeadroomTone, string> = {
  good: 'bg-success',
  warn: 'bg-warning',
  bad: 'bg-error',
  neutral: 'bg-subtle',
};
const TONE_LABEL: Record<HeadroomTone, string> = {
  good: 'Healthy',
  warn: 'Needs attention',
  bad: 'Problem',
  neutral: 'No status',
};

/**
 * GitHub API headroom: the current hour's tightest bucket against the 5000
 * call limit. Red when any sample was empty. `report` is the parsed
 * `jovie-actions-quota-headroom/v1` JSON; null reads Unknown.
 */
export function GithubHeadroomTile({
  report,
  nowMs,
}: Readonly<{ report: HeadroomReport | null; nowMs: number }>) {
  const tile = buildGithubHeadroomTile(report, nowMs);
  return (
    <ContentSurfaceCard surface='details' data-testid='github-headroom-tile'>
      <div className='flex items-center justify-between gap-2'>
        <h2 className='text-app font-semibold text-primary-token'>
          GitHub API Headroom
        </h2>
        <span
          role='img'
          aria-label={TONE_LABEL[tile.tone]}
          className={cn('size-2 rounded-full', DOT[tile.tone])}
        />
      </div>
      <p
        className={cn(
          'mt-2 text-xl font-semibold tabular-nums',
          tile.measured ? 'text-primary-token' : 'text-tertiary-token'
        )}
        data-testid='github-headroom-value'
      >
        {tile.value}
      </p>
      <p className='mt-1 text-2xs text-secondary-token'>{tile.line}</p>
    </ContentSurfaceCard>
  );
}
