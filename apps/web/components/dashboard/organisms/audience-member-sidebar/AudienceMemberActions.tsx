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
    <ul className='space-y-1'>
      {member.latestActions.slice(0, 6).map(action => (
        <li
          key={`${member.id}-${action.label}-${action.timestamp ?? ''}`}
          className={cn(
            'flex items-start gap-2.5 rounded-[8px] border border-transparent px-2.5 py-2 text-sm text-(--linear-text-primary) transition-[background-color,border-color,box-shadow] duration-150 hover:border-(--linear-border-subtle) hover:bg-(--linear-bg-surface-1)'
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
            <span className='ml-2 text-xs text-(--linear-text-tertiary)'>
              {formatTimeAgo(action.timestamp)}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
