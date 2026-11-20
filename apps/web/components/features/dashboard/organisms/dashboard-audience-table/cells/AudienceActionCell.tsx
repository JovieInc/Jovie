'use client';

// @coverage-via apps/web/tests/unit/dashboard/audience-table/AudienceActionCell.test.tsx

import { IconButton, SimpleTooltip } from '@jovie/ui';
import { type MouseEvent, memo, useCallback } from 'react';
import { Icon } from '@/components/atoms/Icon';
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
    (event: MouseEvent) => {
      // A row action never also activates the row.
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
      <span className='sr-only'>No message action for anonymous visitors</span>
    );
  }

  const displayName = getAudienceDisplayName(member);

  return (
    <div className='flex justify-end'>
      <SimpleTooltip content='Message'>
        <IconButton
          variant='secondary'
          size='xs'
          ariaLabel={`Message ${displayName}`}
          onClick={handleClick}
        >
          <Icon name='Send' className='h-3.5 w-3.5' aria-hidden />
        </IconButton>
      </SimpleTooltip>
    </div>
  );
});
