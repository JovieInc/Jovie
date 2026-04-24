'use client';

import { Ghost, User } from 'lucide-react';
import React from 'react';
import { cn } from '@/lib/utils';
import { getFallbackName } from '@/lib/utils/audience';
import {
  capitalizeFirst,
  safeDecodeURIComponent,
} from '@/lib/utils/string-utils';
import type { AudienceMemberType } from '@/types';

export interface AudienceUserCellProps {
  readonly displayName: string | null;
  readonly type: AudienceMemberType;
  readonly tags?: string[];
  readonly deviceType?: string | null;
  readonly geoCity?: string | null;
  readonly geoCountry?: string | null;
  /** Show a colored type dot inline after the name */
  readonly showTypeDot?: boolean;
  readonly className?: string;
}

const DEVICE_LABELS: Record<string, string> = {
  mobile: 'Mobile',
  tablet: 'Tablet',
  desktop: 'Desktop',
};

const TYPE_DOT_COLORS: Record<AudienceMemberType, string> = {
  anonymous: 'bg-zinc-400',
  email: 'bg-blue-500',
  sms: 'bg-violet-500',
  spotify: 'bg-emerald-500',
  customer: 'bg-amber-500',
};

function formatAnonymousVisitorLabel(
  deviceType?: string | null,
  geoCity?: string | null,
  geoCountry?: string | null
): string {
  const deviceLabel = (deviceType && DEVICE_LABELS[deviceType]) ?? 'Unknown';

  const rawLocation = geoCity ?? geoCountry ?? null;
  const locationLabel = rawLocation
    ? safeDecodeURIComponent(rawLocation)
    : null;
  return locationLabel
    ? `${deviceLabel} visitor from ${locationLabel}`
    : `${deviceLabel} visitor`;
}

/**
 * AudienceUserCell - Single-line compact user row with identity icon.
 *
 * Anonymous visitors get a Ghost icon; identified contacts get a User icon.
 * Primary label is either the display name or a descriptive "Mobile visitor from ..." label.
 * When showTypeDot is true, a colored dot indicating member type appears after the name.
 */
export const AudienceUserCell = React.memo(function AudienceUserCell({
  displayName,
  type,
  tags = [],
  deviceType,
  geoCity,
  geoCountry,
  showTypeDot,
  className,
}: AudienceUserCellProps) {
  const isAnonymous = type === 'anonymous';
  const isBot = tags.includes('bot');

  const primaryLabel = isAnonymous
    ? formatAnonymousVisitorLabel(deviceType, geoCity, geoCountry)
    : displayName || getFallbackName(type);

  const IconComponent = isAnonymous ? Ghost : User;

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2 text-app text-primary-token',
        className
      )}
    >
      <IconComponent
        className={cn(
          'h-3.5 w-3.5 shrink-0',
          isAnonymous ? 'text-quaternary-token' : 'text-tertiary-token'
        )}
        aria-hidden='true'
      />
      <span
        className={cn(
          'truncate',
          isAnonymous ? 'font-[400] text-secondary-token' : 'font-caption'
        )}
      >
        {primaryLabel}
      </span>
      {isBot ? (
        <span className='shrink-0 rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-caption text-amber-700 dark:text-amber-300'>
          Bot
        </span>
      ) : null}
      {showTypeDot && !isAnonymous && (
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            TYPE_DOT_COLORS[type]
          )}
          aria-hidden='true'
          title={type === 'sms' ? 'SMS' : capitalizeFirst(type)}
        />
      )}
    </div>
  );
});
