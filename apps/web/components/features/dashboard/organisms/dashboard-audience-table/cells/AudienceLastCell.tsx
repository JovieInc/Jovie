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

  // During SSR we don't have a stable clock; render an em dash so the row
  // does not flicker through "now → 5d" on hydration. Post-mount the real
  // compact form takes over.
  if (isSsrNowMs(nowMs)) {
    return <span className='text-2xs text-tertiary-token tabular-nums'>—</span>;
  }
  const compact = formatCompact(Math.max(0, nowMs - seenMs));

  return (
    <span className='text-2xs text-tertiary-token tabular-nums'>{compact}</span>
  );
});
