'use client';

import { Ghost, User } from 'lucide-react';
import React from 'react';
import { cn } from '@/lib/utils';
import { getFallbackName } from '@/lib/utils/audience';
import { safeDecodeURIComponent } from '@/lib/utils/string-utils';
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

const DEVICE_LABELS: Record<string, string> = {
  mobile: 'Mobile',
  tablet: 'Tablet',
  desktop: 'Desktop',
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
 */
export const AudienceUserCell = React.memo(function AudienceUserCell({
  displayName,
  type,
  deviceType,
  geoCity,
  geoCountry,
  className,
}: AudienceUserCellProps) {
  const isAnonymous = type === 'anonymous';

  const primaryLabel = isAnonymous
    ? formatAnonymousVisitorLabel(deviceType, geoCity, geoCountry)
    : displayName || getFallbackName(type);

  const IconComponent = isAnonymous ? Ghost : User;

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-[13px] text-primary-token min-w-0',
        className
      )}
    >
      <IconComponent
        className='h-3.5 w-3.5 shrink-0 text-tertiary-token'
        aria-hidden='true'
      />
      <span className='truncate font-[510]'>{primaryLabel}</span>
    </div>
  );
});
