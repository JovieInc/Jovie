'use client';

import { memo } from 'react';
import { PersonCell } from '@/components/organisms/table/atoms/PersonCell';
import type { AudienceMember } from '@/types';
import {
  getAudienceDisplayName,
  getAudienceIdentityChip,
  isAudienceMemberAnonymous,
} from '../row-contract';

export interface AudienceFanCellProps {
  readonly member: AudienceMember;
}

/** Audience identity on the shared one-line people row. */
export const AudienceFanCell = memo(function AudienceFanCell({
  member,
}: AudienceFanCellProps) {
  const isAnonymous = isAudienceMemberAnonymous(member);
  const displayName = getAudienceDisplayName(member);

  return (
    <PersonCell
      name={displayName}
      secondary={
        isAnonymous ? null : getAudienceIdentityChip(member, displayName)
      }
      anonymous={isAnonymous}
    />
  );
});
