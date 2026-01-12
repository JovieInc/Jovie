'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { AudienceMemberType } from '@/types';

export interface AudienceUserCellProps {
  displayName: string | null;
  type: AudienceMemberType;
  email?: string | null;
  phone?: string | null;
  className?: string;
}

/**
 * Memoized for performance in virtualized tables to prevent unnecessary re-renders.
 */
export const AudienceUserCell = React.memo(function AudienceUserCell({
  displayName,
  type,
  email,
  phone,
  className,
}: AudienceUserCellProps) {
  const getSecondaryLabel = () => {
    if (type === 'anonymous') return null;
    if (type === 'email') return email ?? 'Email fan';
    if (type === 'sms') return phone ?? 'SMS fan';
    return 'Connected fan';
  };

  const secondaryLabel = getSecondaryLabel();

  return (
    <td
      className={cn(
        'px-4 py-3 align-middle text-sm text-primary-token sm:px-6',
        className
      )}
    >
      <div className='font-semibold line-clamp-1'>
        {displayName || 'Visitor'}
      </div>
      {secondaryLabel && (
        <div className='text-xs text-secondary-token line-clamp-1'>
          {secondaryLabel}
        </div>
      )}
    </td>
  );
});
