'use client';

/**
 * AudienceMemberActions Component
 *
 * Renders the recent actions section with icons and timestamps
 */

import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils/audience';
import type { AudienceMember } from '@/types';
import { formatActionLabel, resolveAudienceActionIcon } from './utils';

interface AudienceMemberActionsProps
  extends Readonly<{
    member: AudienceMember;
  }> {}

export function AudienceMemberActions({ member }: AudienceMemberActionsProps) {
  if (member.latestActions.length === 0) {
    return <div className='text-sm text-secondary-token'>No actions yet.</div>;
  }

  return (
    <ul className='space-y-2'>
      {member.latestActions.slice(0, 6).map(action => (
        <li
          key={`${member.id}-${action.label}-${action.timestamp ?? ''}`}
          className={cn('flex items-start gap-2 text-sm text-primary-token')}
        >
          <span
            className='mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-2/40 text-tertiary-token'
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
            <span className='ml-2 text-xs text-secondary-token'>
              {formatTimeAgo(action.timestamp)}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
