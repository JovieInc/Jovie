'use client';

// @coverage-via apps/web/tests/unit/dashboard/audience-table/AudienceFanCell.test.tsx

import { memo } from 'react';
import { IdentityCell } from '@/components/organisms/table/cells/IdentityCell';
import type { AudienceMember } from '@/types';
import {
  getAudienceDescriptor,
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
    <IdentityCell
      name={displayName}
      secondary={
        (isAnonymous ? null : getAudienceIdentityChip(member, displayName)) ??
        getAudienceDescriptor(member)
      }
      anonymous={isAnonymous}
    />
  );
});
