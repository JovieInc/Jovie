'use client';

import { DotBadge, type DotBadgeVariant } from '@/components/atoms/DotBadge';
import type { AudienceMemberType } from '@/types';

export interface AudienceTypeBadgeProps {
  readonly type: AudienceMemberType;
  readonly className?: string;
}

const TYPE_VARIANTS: Record<AudienceMemberType, DotBadgeVariant> = {
  anonymous: {
    className:
      'border-(--linear-border-subtle) bg-transparent text-(--linear-text-tertiary)',
    dotClassName: 'bg-zinc-400',
  },
  email: {
    className:
      'border-(--linear-border-default) bg-(--linear-bg-surface-1) text-(--linear-text-secondary)',
    dotClassName: 'bg-blue-500',
  },
  sms: {
    className:
      'border-(--linear-border-default) bg-(--linear-bg-surface-1) text-(--linear-text-secondary)',
    dotClassName: 'bg-violet-500',
  },
  spotify: {
    className:
      'border-(--linear-border-default) bg-(--linear-bg-surface-1) text-(--linear-text-secondary)',
    dotClassName: 'bg-emerald-500',
  },
  customer: {
    className:
      'border-(--linear-border-default) bg-(--linear-bg-surface-1) text-(--linear-text-secondary)',
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
