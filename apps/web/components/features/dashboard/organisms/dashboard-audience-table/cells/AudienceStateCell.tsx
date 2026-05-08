'use client';

import { memo } from 'react';
import {
  type AudienceRowState,
  deriveAudienceState,
} from '@/lib/audience/derive-state';
import { cn } from '@/lib/utils';
import type { AudienceMember } from '@/types';
import { isSsrNowMs, useNowMs } from './NowMsContext';

export interface AudienceStateCellProps {
  readonly member: AudienceMember;
  readonly mode: 'members' | 'subscribers';
}

type DisplayState = AudienceRowState | 'subscriber';

const STATE_STYLES: Record<DisplayState, string> = {
  high: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/25',
  rising: 'bg-amber-500/15 text-amber-300 ring-amber-500/25',
  dormant: 'bg-surface-0 text-tertiary-token ring-subtle',
  subscriber: 'bg-violet-500/15 text-violet-200 ring-violet-500/25',
};

const STATE_LABEL: Record<DisplayState, string> = {
  high: 'High',
  rising: 'Rising',
  dormant: 'Dormant',
  subscriber: 'Subscriber',
};

export const AudienceStateCell = memo(function AudienceStateCell({
  member,
  mode,
}: AudienceStateCellProps) {
  const nowMs = useNowMs();

  // Subscribers bypass derivation (their visits/intent are server-baked
  // placeholders that would render every row as Dormant).
  let state: DisplayState;
  if (mode === 'subscribers') {
    state = 'subscriber';
  } else if (isSsrNowMs(nowMs)) {
    // Neutral SSR placeholder — flips to real state after mount.
    state = 'rising';
  } else {
    state = deriveAudienceState(member, nowMs);
  }

  const label = STATE_LABEL[state];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-2xs font-medium tabular-nums ring-1 ring-inset',
        STATE_STYLES[state]
      )}
    >
      <span className='sr-only'>State: </span>
      {label}
    </span>
  );
});
