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
            'group flex items-start gap-2 rounded-md border border-transparent px-1.5 py-1.5 text-xs text-primary-token transition-colors hover:bg-surface-0'
          )}
        >
          <span
            className='mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-1 text-tertiary-token'
            aria-hidden='true'
          >
            <Icon
              name={resolveAudienceActionIcon(action.label)}
              className='h-3 w-3'
            />
          </span>
          <span className='min-w-0 flex-1 leading-4'>
            {formatActionLabel(action.label)}
          </span>
          {action.timestamp ? (
            <span className='ml-2 whitespace-nowrap text-[10.5px] text-secondary-token'>
              {formatTimeAgo(action.timestamp)}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
