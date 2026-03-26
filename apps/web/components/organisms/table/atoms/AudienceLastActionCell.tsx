'use client';

import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';
import type { AudienceAction } from '@/types';

export interface AudienceLastActionCellProps {
  readonly actions: AudienceAction[];
  readonly className?: string;
}

function resolveActionIcon(label: string | null | undefined): string {
  const normalized = label?.trim().toLowerCase() ?? '';
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
    return null;
  }

  const lastAction = actions[0];
  const actionLabel = lastAction.label?.trim() || 'Unknown action';
  const iconName = resolveActionIcon(lastAction.label);

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 text-[13px] text-secondary-token',
        className
      )}
    >
      <Icon
        name={iconName}
        className='h-3.5 w-3.5 shrink-0 text-quaternary-token'
        aria-hidden='true'
      />
      <span className='truncate text-[12px]'>{actionLabel}</span>
    </div>
  );
}
