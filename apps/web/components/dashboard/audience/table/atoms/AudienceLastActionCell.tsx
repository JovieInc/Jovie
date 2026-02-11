'use client';

import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';
import type { AudienceAction } from '@/types';

export interface AudienceLastActionCellProps {
  readonly actions: AudienceAction[];
  readonly className?: string;
}

function resolveActionIcon(label: string): string {
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

export function AudienceLastActionCell({
  actions,
  className,
}: AudienceLastActionCellProps) {
  if (!actions.length) {
    return (
      <div className={cn('text-xs text-tertiary-token', className)}>—</div>
    );
  }

  const lastAction = actions[0];
  const iconName = resolveActionIcon(lastAction.label);

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 text-xs text-secondary-token',
        className
      )}
    >
      <span className='inline-flex h-5 w-5 items-center justify-center rounded-full border border-subtle bg-surface-2/40 text-tertiary-token'>
        <Icon name={iconName} className='h-2.5 w-2.5' aria-hidden='true' />
      </span>
      <span className='truncate'>{lastAction.label}</span>
    </div>
  );
}
