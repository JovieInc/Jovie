'use client';

import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils/audience';
import { capitalizeFirst } from '@/lib/utils/string-utils';
import type { AudienceAction } from '@/types';

export interface AudienceLastActionCellProps {
  readonly actions: AudienceAction[];
  /** Optional last seen timestamp — shown as relative time after the action label */
  readonly lastSeenAt?: string | null;
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
  lastSeenAt,
  className,
}: AudienceLastActionCellProps) {
  const timeAgo = lastSeenAt ? formatTimeAgo(lastSeenAt) : null;

  if (!actions.length && !timeAgo) {
    return null;
  }

  const lastAction = actions[0];
  const actionLabel = lastAction
    ? capitalizeFirst(lastAction.label?.trim()) || 'Unknown action'
    : null;
  const iconName = lastAction ? resolveActionIcon(lastAction.label) : 'Clock';

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 text-[13px] text-secondary-token min-w-0',
        className
      )}
    >
      <Icon
        name={iconName}
        className='h-3.5 w-3.5 shrink-0 text-quaternary-token'
        aria-hidden='true'
      />
      {actionLabel && (
        <span className='truncate text-[12px]'>{actionLabel}</span>
      )}
      {timeAgo && (
        <>
          {actionLabel && (
            <span
              className='text-quaternary-token select-none shrink-0'
              aria-hidden='true'
            >
              ·
            </span>
          )}
          <span className='shrink-0 text-[11px] text-tertiary-token tabular-nums'>
            {timeAgo}
          </span>
        </>
      )}
    </div>
  );
}
