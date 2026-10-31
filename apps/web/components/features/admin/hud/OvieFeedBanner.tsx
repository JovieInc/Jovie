'use client';

import {
  type FullscreenFeedStatus,
  formatFeedAge,
} from '@/lib/ovie/home/fullscreen-mode';

/** Shown on Home (normal and Full screen) when a feed stops: never a calm default. */
export function OvieFeedBanner({
  status,
}: Readonly<{ status: FullscreenFeedStatus }>) {
  if (status.level === 'live') return null;
  const down = status.level === 'down';
  return (
    <div
      role='alert'
      data-testid='ovie-feed-banner'
      className={
        down
          ? 'rounded-lg border-2 border-error bg-surface-1 px-4 py-2 text-sm font-semibold text-error'
          : 'rounded-lg border-2 border-warning bg-surface-1 px-4 py-2 text-sm font-semibold text-warning'
      }
    >
      {down ? 'Data down' : 'Data stale'}
      {': '}
      {status.stale
        .map(item => `${item.id} ${formatFeedAge(item.ageMs)}`)
        .join(' · ')}
      {'. Numbers may be out of date.'}
    </div>
  );
}
