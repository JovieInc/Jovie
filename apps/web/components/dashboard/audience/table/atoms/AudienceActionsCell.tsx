'use client';

import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';
import type { AudienceAction } from '@/types';

export interface AudienceActionsCellProps {
  rowId: string;
  actions: AudienceAction[];
  maxActions?: number;
  className?: string;
}

function resolveAudienceActionIcon(label: string): string {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes('visit')) return 'Eye';
  if (normalized.includes('view')) return 'Eye';
  if (normalized.includes('tip')) return 'HandCoins';
  if (normalized.includes('purchase')) return 'CreditCard';
  if (normalized.includes('subscribe')) return 'Bell';
  if (normalized.includes('follow')) return 'UserPlus';
  if (normalized.includes('click')) return 'MousePointerClick';
  if (normalized.includes('link')) return 'Link';
  return 'Sparkles';
}

export function AudienceActionsCell({
  rowId,
  actions,
  maxActions = 3,
  className,
}: AudienceActionsCellProps) {
  return (
    <div
      className={cn('flex items-center justify-end gap-1.5 text-xs', className)}
    >
      {actions.slice(0, maxActions).map((action, idx) => {
        const iconName = resolveAudienceActionIcon(action.label);
        return (
          <span
            key={`${rowId}-${action.label}-${action.platform ?? 'unknown'}-${action.timestamp ?? 'unknown'}-${idx}`}
            className='inline-flex h-6 w-6 items-center justify-center rounded-full border border-subtle bg-surface-2/40 text-tertiary-token'
            title={action.label}
          >
            <Icon name={iconName} className='h-3 w-3' aria-hidden='true' />
            <span className='sr-only'>{action.label}</span>
          </span>
        );
      })}
    </div>
  );
}
