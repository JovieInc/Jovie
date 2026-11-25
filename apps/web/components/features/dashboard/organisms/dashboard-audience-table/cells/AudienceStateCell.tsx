'use client';

import { memo } from 'react';
import { StatusCell } from '@/components/organisms/table/cells/StatusCell';
import type { AudienceMember } from '@/types';
import {
  AUDIENCE_STATE_LABELS,
  AUDIENCE_STATE_TONES,
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
    <StatusCell tone={AUDIENCE_STATE_TONES[state]}>
      <span className='sr-only'>State: </span>
      {label}
    </StatusCell>
  );
});
