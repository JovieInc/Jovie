'use client';

import { Button } from '@jovie/ui';
import { memo, useCallback } from 'react';
import type { AudienceMember } from '@/types';
import { useAudienceTableStableContext } from '../AudienceTableContext';
import {
  canMessageAudienceMember,
  getAudienceDisplayName,
} from '../row-contract';

export interface AudienceActionCellProps {
  readonly member: AudienceMember;
}

export const AudienceActionCell = memo(function AudienceActionCell({
  member,
}: AudienceActionCellProps) {
  const { onSendNotification } = useAudienceTableStableContext();
  const canMessage = canMessageAudienceMember(member);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (!canMessage) {
        return;
      }
      onSendNotification(member);
    },
    [member, onSendNotification, canMessage]
  );

  if (!canMessage) {
    return (
      <span className='sr-only'>No message action for anonymous fans</span>
    );
  }

  const displayName = getAudienceDisplayName(member);

  return (
    <div className='flex justify-end'>
      <Button
        type='button'
        variant='secondary'
        size='sm'
        onClick={handleClick}
        aria-label={`Message ${displayName}`}
        className='min-h-[28px] px-2.5 text-2xs'
      >
        Message
      </Button>
    </div>
  );
});
