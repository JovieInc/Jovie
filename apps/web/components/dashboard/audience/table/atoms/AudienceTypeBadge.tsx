'use client';

import { DotBadge, type DotBadgeVariant } from '@/components/atoms/DotBadge';
import type { AudienceMemberType } from '@/types';

export interface AudienceTypeBadgeProps {
  readonly type: AudienceMemberType;
  readonly className?: string;
}

const TYPE_VARIANTS: Record<AudienceMemberType, DotBadgeVariant> = {
  anonymous: {
    className: 'border border-subtle bg-transparent text-tertiary-token',
    dotClassName: 'bg-zinc-400',
  },
  email: {
    className: 'border border-subtle bg-surface-2/40 text-secondary-token',
    dotClassName: 'bg-blue-500',
  },
  sms: {
    className: 'border border-subtle bg-surface-2/40 text-secondary-token',
    dotClassName: 'bg-violet-500',
  },
  spotify: {
    className: 'border border-subtle bg-surface-2/40 text-secondary-token',
    dotClassName: 'bg-emerald-500',
  },
  customer: {
    className: 'border border-subtle bg-surface-2/40 text-secondary-token',
    dotClassName: 'bg-amber-500',
  },
};

export function AudienceTypeBadge({ type, className }: AudienceTypeBadgeProps) {
  const variant = TYPE_VARIANTS[type];
  const label = type.charAt(0).toUpperCase() + type.slice(1);

  return (
    <DotBadge label={label} variant={variant} size='sm' className={className} />
  );
}
