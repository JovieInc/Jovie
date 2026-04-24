'use client';

import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';
import type { AudienceAction } from '@/types';

export interface AudienceActionsCellProps {
  readonly rowId: string;
  readonly actions: AudienceAction[];
  readonly maxActions?: number;
  readonly className?: string;
}

function resolveAudienceActionIcon(label: string | null | undefined): string {
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

export function AudienceActionsCell({
  rowId,
  actions,
  maxActions = 3,
  className,
}: AudienceActionsCellProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-1.5 text-2xs',
        className
      )}
    >
      {(() => {
        const seenActionKeys = new Map<string, number>();

        return actions.slice(0, maxActions).map(action => {
          const iconName = resolveAudienceActionIcon(action.label);
          const actionLabel = action.label?.trim() || 'Unknown action';
          const actionBaseKey = `${rowId}-${actionLabel}-${action.platform ?? 'unknown'}-${action.timestamp ?? 'unknown'}`;
          const seenCount = seenActionKeys.get(actionBaseKey) ?? 0;
          seenActionKeys.set(actionBaseKey, seenCount + 1);

          return (
            <span
              key={
                seenCount === 0
                  ? actionBaseKey
                  : `${actionBaseKey}-${seenCount + 1}`
              }
              className='inline-flex h-6 w-6 items-center justify-center rounded-full border border-subtle bg-surface-0 text-tertiary-token'
              title={actionLabel}
            >
              <Icon name={iconName} className='h-3 w-3' aria-hidden='true' />
              <span className='sr-only'>{actionLabel}</span>
            </span>
          );
        });
      })()}
    </div>
  );
}
