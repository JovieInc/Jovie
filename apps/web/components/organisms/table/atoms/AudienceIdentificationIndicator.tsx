'use client';

import { CircleAlert, CircleCheck, CircleDashed } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AudienceMemberType } from '@/types';

export interface AudienceIdentificationIndicatorProps {
  readonly type: AudienceMemberType;
  readonly hasEmail: boolean;
  readonly hasPhone: boolean;
  readonly spotifyConnected: boolean;
  readonly className?: string;
}

type IdentificationLevel = 'identified' | 'partial' | 'anonymous';

function getIdentificationLevel(
  type: AudienceMemberType,
  hasEmail: boolean,
  hasPhone: boolean,
  spotifyConnected: boolean
): IdentificationLevel {
  if (type === 'anonymous' && !hasEmail && !hasPhone && !spotifyConnected) {
    return 'anonymous';
  }
  if (hasEmail || type === 'customer' || type === 'spotify') {
    return 'identified';
  }
  return 'partial';
}

const LEVEL_CONFIG: Record<
  IdentificationLevel,
  { label: string; iconClassName: string; labelClassName: string }
> = {
  identified: {
    label: 'Identified',
    iconClassName: 'text-success',
    labelClassName: 'text-success-text',
  },
  partial: {
    label: 'Partial',
    iconClassName: 'text-warning',
    labelClassName: 'text-warning-text',
  },
  anonymous: {
    label: 'Anonymous',
    iconClassName: 'text-tertiary-token',
    labelClassName: 'text-tertiary-token',
  },
};

const LEVEL_ICONS: Record<IdentificationLevel, typeof CircleCheck> = {
  identified: CircleCheck,
  partial: CircleAlert,
  anonymous: CircleDashed,
};

export function AudienceIdentificationIndicator({
  type,
  hasEmail,
  hasPhone,
  spotifyConnected,
  className,
}: AudienceIdentificationIndicatorProps) {
  const level = getIdentificationLevel(
    type,
    hasEmail,
    hasPhone,
    spotifyConnected
  );
  const config = LEVEL_CONFIG[level];

  const IconComponent = LEVEL_ICONS[level];

  return (
    <div className={cn('flex items-center gap-1.5 text-app', className)}>
      <IconComponent
        className={cn('h-3.5 w-3.5 shrink-0', config.iconClassName)}
        aria-hidden='true'
      />
      <span className={config.labelClassName}>{config.label}</span>
    </div>
  );
}
