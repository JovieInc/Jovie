import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import type { RankedQueue } from '@/lib/waitlist/ranked-queue';

const HOLD_LABELS: Record<string, string> = {
  hold_capacity_full: 'Daily budget used',
  hold_outranked: 'Outranked today',
  hold_golden_path_not_green: 'Golden path not green',
  hold_open_learnings: 'Learning throttle closed',
  hold_auto_accept_disabled: 'Auto-accept off',
  hold_high_profile_needs_verification: 'Needs verification',
  hold_identity_unresolved: 'Identity unresolved',
  hold_reach_unknown: 'Reach unknown',
};

function formatScore(score: number | null): string {
  return score === null ? 'unscored' : score.toFixed(1);
}

/**
 * The pending admission queue in spend order. Each day's auto-accept budget
 * goes to the top of this list; every score is explained by its components.
 */
export function WaitlistRankedQueuePanel({
  queue,
}: Readonly<{ queue: RankedQueue | null }>) {
  return (
    <ContentSurfaceCard surface='details'>
      <div className='space-y-3 p-3' data-testid='waitlist-ranked-queue'>
        <div>
          <h2 className='text-balance text-app font-semibold text-primary-token'>
            Admission Queue
          </h2>
          {queue ? (
            <p className='mt-1 text-app text-secondary-token'>
              {queue.capacity.autoAcceptEnabled
                ? `${Math.max(0, queue.capacity.dailyLimit - queue.capacity.usedToday)} of ${queue.capacity.dailyLimit} slots left today. The best scores are admitted first.`
                : 'Auto-accept is off, so nobody is admitted from this queue.'}
            </p>
          ) : null}
        </div>
        {queue === null ? (
          <p className='text-app text-secondary-token'>
            The queue could not be read.
          </p>
        ) : queue.rows.length === 0 ? (
          <p className='text-app text-secondary-token'>Nobody is waiting.</p>
        ) : (
          <ol className='divide-y divide-subtle text-app'>
            {queue.rows.map((row, index) => (
              <li
                key={row.entryId}
                className='flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5'
              >
                <span className='w-6 shrink-0 tabular-nums text-secondary-token'>
                  {index + 1}
                </span>
                <span className='min-w-0 flex-1 truncate text-primary-token'>
                  {row.artistName ?? 'Unnamed artist'}
                </span>
                <span className='w-16 shrink-0 tabular-nums'>
                  {formatScore(row.score)}
                </span>
                <span className='w-full text-secondary-token sm:w-auto'>
                  {row.components
                    ? `identity ${row.components.identity}, audience ${row.components.audience}, catalog ${row.components.catalog}, intent ${row.components.intent}`
                    : 'queued before scoring'}
                  {row.unmeasured.length > 0
                    ? ` (not measured: ${row.unmeasured.join(', ')})`
                    : ''}
                  {row.holdReason
                    ? `. ${HOLD_LABELS[row.holdReason] ?? row.holdReason}`
                    : ''}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </ContentSurfaceCard>
  );
}
