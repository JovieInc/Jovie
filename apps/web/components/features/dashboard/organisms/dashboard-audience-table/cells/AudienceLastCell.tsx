'use client';

import { memo } from 'react';
import { isSsrNowMs, useNowMs } from './NowMsContext';

export interface AudienceLastCellProps {
  readonly lastSeenAt: string | null;
}

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function formatCompact(ms: number): string {
  if (ms < MS_PER_MINUTE) return 'now';
  if (ms < MS_PER_HOUR) return `${Math.floor(ms / MS_PER_MINUTE)}m`;
  if (ms < MS_PER_DAY) return `${Math.floor(ms / MS_PER_HOUR)}h`;
  return `${Math.floor(ms / MS_PER_DAY)}d`;
}

export const AudienceLastCell = memo(function AudienceLastCell({
  lastSeenAt,
}: AudienceLastCellProps) {
  const nowMs = useNowMs();

  if (!lastSeenAt) {
    return <span className='text-2xs text-tertiary-token tabular-nums'>—</span>;
  }

  const seenMs = Date.parse(lastSeenAt);
  if (Number.isNaN(seenMs)) {
    return <span className='text-2xs text-tertiary-token tabular-nums'>—</span>;
  }

  // During SSR, render the absolute date as a stable placeholder. After mount
  // the relative compact form takes over without a hydration mismatch since
  // text content changes are allowed post-mount.
  const compact = isSsrNowMs(nowMs)
    ? // Stable "Xd" placeholder using a fixed reference (lastSeenAt itself);
      // results in "0m" / "0h" worst case — flips on mount.
      formatCompact(0)
    : formatCompact(Math.max(0, nowMs - seenMs));

  return (
    <span className='text-2xs text-tertiary-token tabular-nums'>{compact}</span>
  );
});
