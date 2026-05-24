'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { AudienceMember } from '@/types';
import {
  AUDIENCE_STATE_LABELS,
  AUDIENCE_STATE_STYLES,
  getAudienceDisplayState,
} from '../row-contract';
import { isSsrNowMs, useNowMs } from './NowMsContext';

export interface AudienceStateCellProps {
  readonly member: AudienceMember;
  readonly mode: 'members' | 'subscribers';
}

export const AudienceStateCell = memo(function AudienceStateCell({
  member,
  mode,
}: AudienceStateCellProps) {
  const nowMs = useNowMs();
  const state = getAudienceDisplayState({
    member,
    mode,
    nowMs,
    isSsr: isSsrNowMs(nowMs),
  });
  const label = AUDIENCE_STATE_LABELS[state];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-2xs font-medium tabular-nums ring-1 ring-inset',
        AUDIENCE_STATE_STYLES[state]
      )}
    >
      <span className='sr-only'>State: </span>
      {label}
    </span>
  );
});
