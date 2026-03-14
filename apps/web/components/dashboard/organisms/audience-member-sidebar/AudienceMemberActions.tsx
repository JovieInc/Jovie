'use client';

/**
 * AudienceMemberActions Component
 *
 * Renders the recent actions section with icons and timestamps
 */

import { Icon } from '@/components/atoms/Icon';
import { DrawerEmptyState } from '@/components/molecules/drawer';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils/audience';
import type { AudienceMember } from '@/types';
import { formatActionLabel, resolveAudienceActionIcon } from './utils';

interface AudienceMemberActionsProps
  extends Readonly<{
    readonly member: AudienceMember;
  }> {}

export function AudienceMemberActions({ member }: AudienceMemberActionsProps) {
  if (member.latestActions.length === 0) {
    return (
      <DrawerEmptyState className='min-h-[96px]' message='No actions yet.' />
    );
  }

  return (
    <ul className='space-y-1.5'>
      {member.latestActions.slice(0, 6).map(action => (
        <li
          key={`${member.id}-${action.label}-${action.timestamp ?? ''}`}
          className={cn(
            'group flex items-start gap-2 rounded-md border border-transparent px-1.5 py-1.5 text-sm text-primary-token transition-colors hover:border-subtle hover:bg-surface-2/60'
          )}
        >
          <span
            className='mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) text-(--linear-text-tertiary)'
            aria-hidden='true'
          >
            <Icon
              name={resolveAudienceActionIcon(action.label)}
              className='h-3.5 w-3.5'
            />
          </span>
          <span className='min-w-0 flex-1'>
            {formatActionLabel(action.label)}
          </span>
          {action.timestamp ? (
            <span className='ml-2 whitespace-nowrap text-[11px] text-secondary-token'>
              {formatTimeAgo(action.timestamp)}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
