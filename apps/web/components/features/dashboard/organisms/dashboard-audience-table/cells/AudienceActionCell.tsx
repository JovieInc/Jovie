'use client';

// @coverage-via apps/web/tests/unit/dashboard/audience-table/AudienceActionCell.test.tsx

import { memo, useCallback } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { TableIconButton } from '@/components/organisms/table/atoms/TableIconButton';
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

  const handleClick = useCallback(() => {
    if (!canMessage) {
      return;
    }
    onSendNotification(member);
  }, [member, onSendNotification, canMessage]);

  if (!canMessage) {
    return (
      <span className='sr-only'>No message action for anonymous fans</span>
    );
  }

  const displayName = getAudienceDisplayName(member);

  return (
    <div className='flex justify-end'>
      <TableIconButton
        dense
        icon={<Icon name='Send' className='h-3.5 w-3.5' aria-hidden />}
        onClick={handleClick}
        ariaLabel={`Message ${displayName}`}
        tooltip='Message'
      />
    </div>
  );
});
