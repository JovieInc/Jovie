'use client';

import { Button } from '@jovie/ui';
import { memo, useCallback } from 'react';
import { toast } from 'sonner';
import type { AudienceMember } from '@/types';
import { useAudienceTableStableContext } from '../AudienceTableContext';
import { isAudienceMemberReachable } from '../row-contract';

export interface AudienceActionCellProps {
  readonly member: AudienceMember;
}

export const AudienceActionCell = memo(function AudienceActionCell({
  member,
}: AudienceActionCellProps) {
  const { onSendNotification } = useAudienceTableStableContext();
  const reachable = isAudienceMemberReachable(member);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (!reachable) {
        toast.message('No reachable channel for this fan');
        return;
      }
      onSendNotification(member);
    },
    [member, onSendNotification, reachable]
  );

  return (
    <div className='flex justify-end'>
      <Button
        type='button'
        variant='secondary'
        size='sm'
        onClick={handleClick}
        disabled={!reachable}
        aria-label={`Message ${member.displayName ?? 'fan'}`}
        className='min-h-[28px] px-2.5 text-2xs'
      >
        Message
      </Button>
    </div>
  );
});
