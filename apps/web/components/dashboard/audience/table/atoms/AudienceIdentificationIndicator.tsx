'use client';

import { CircleCheck, CircleDashed, CircleDot } from 'lucide-react';
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
    iconClassName: 'text-emerald-500',
    labelClassName: 'text-emerald-600 dark:text-emerald-400',
  },
  partial: {
    label: 'Partial',
    iconClassName: 'text-amber-400',
    labelClassName: 'text-amber-600 dark:text-amber-400',
  },
  anonymous: {
    label: 'Anonymous',
    iconClassName: 'text-zinc-400',
    labelClassName: 'text-tertiary-token',
  },
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

  const IconComponent =
    level === 'identified'
      ? CircleCheck
      : level === 'partial'
        ? CircleDot
        : CircleDashed;

  return (
    <div className={cn('flex items-center gap-1.5 text-[13px]', className)}>
      <IconComponent
        className={cn('h-3.5 w-3.5 shrink-0', config.iconClassName)}
        aria-hidden='true'
      />
      <span className={config.labelClassName}>{config.label}</span>
    </div>
  );
}
