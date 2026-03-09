'use client';

import React from 'react';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { cn } from '@/lib/utils';
import { getFallbackName } from '@/lib/utils/audience';
import type { AudienceMemberType } from '@/types';

export interface AudienceUserCellProps {
  readonly displayName: string | null;
  readonly type: AudienceMemberType;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly deviceType?: string | null;
  readonly geoCity?: string | null;
  readonly geoCountry?: string | null;
  readonly className?: string;
}

function formatAnonymousVisitorLabel(
  deviceType?: string | null,
  geoCity?: string | null,
  geoCountry?: string | null
): string {
  const deviceLabel =
    deviceType === 'mobile'
      ? 'Mobile'
      : deviceType === 'tablet'
        ? 'Tablet'
        : deviceType === 'desktop'
          ? 'Desktop'
          : 'Unknown';

  const locationLabel = geoCity ?? geoCountry ?? null;
  return locationLabel
    ? `${deviceLabel} visitor from ${locationLabel}`
    : `${deviceLabel} visitor`;
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
 * @param type - Audience member type: 'anonymous', 'email', 'sms', 'spotify', 'customer'
 * @param email - User's email address (for email type members)
 * @param phone - User's phone number (for SMS type members)
 */
export const AudienceUserCell = React.memo(function AudienceUserCell({
  displayName,
  type,
  email,
  phone,
  deviceType,
  geoCity,
  geoCountry,
  className,
}: AudienceUserCellProps) {
  const getSecondaryLabel = () => {
    if (type === 'anonymous') {
      return formatAnonymousVisitorLabel(deviceType, geoCity, geoCountry);
    }
    if (type === 'email') return 'Email Subscriber';
    if (type === 'sms') return 'SMS Subscriber';
    return 'Connected fan';
  };

  const secondaryLabel = getSecondaryLabel();

  return (
    <div className={cn('text-[13px] text-primary-token min-w-0', className)}>
      <TruncatedText lines={1} className='font-[510]'>
        {displayName || getFallbackName(type)}
      </TruncatedText>
      {secondaryLabel && (
        <TruncatedText
          lines={1}
          className='text-[11px] text-secondary-token mt-0.5'
        >
          {secondaryLabel}
        </TruncatedText>
      )}
    </div>
  );
});
