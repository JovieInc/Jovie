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
 * AudienceUserCell - Display user information in the audience table
 *
 * **Performance Optimization**: Memoized with React.memo to prevent unnecessary re-renders
 * in the audience table. This component is rendered for each audience member row and benefits
 * from memoization because:
 * - Props are simple primitives (strings, enums)
 * - Shallow equality check is efficient and sufficient
 * - Reduces re-render cost when parent table state changes (pagination, sorting, filtering)
 * - Improves scroll performance in large audience lists
 *
 * @param displayName - User's display name or null for anonymous visitors
 * @param type - Audience member type: 'anonymous', 'email', 'sms', 'connected'
 * @param email - User's email address (for email type members)
 * @param phone - User's phone number (for SMS type members)
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
    <div className={cn('text-sm text-primary-token', className)}>
      <div className='font-semibold line-clamp-1'>
        {displayName || 'Visitor'}
      </div>
      {secondaryLabel && (
        <div className='text-xs text-secondary-token line-clamp-1'>
          {secondaryLabel}
        </div>
      )}
    </div>
  );
});
