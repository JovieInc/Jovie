'use client';

import { memo } from 'react';
import { RelativeTimeCell } from '@/components/organisms/table/cells/RelativeTimeCell';
import { isSsrNowMs, useNowMs } from './NowMsContext';

export interface AudienceLastCellProps {
  readonly lastSeenAt: string | null;
}

/** Maps audience data to the kit's RelativeTimeCell; no styling of its own. */
export const AudienceLastCell = memo(function AudienceLastCell({
  lastSeenAt,
}: AudienceLastCellProps) {
  const nowMs = useNowMs();
  // SSR has no stable clock: a dash avoids a "now -> 5d" flicker on hydration.
  return (
    <RelativeTimeCell
      value={lastSeenAt}
      nowMs={isSsrNowMs(nowMs) ? null : nowMs}
    />
  );
});
