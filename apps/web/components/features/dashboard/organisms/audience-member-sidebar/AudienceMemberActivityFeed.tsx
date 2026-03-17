'use client';

import { Icon } from '@/components/atoms/Icon';
import { DrawerEmptyState } from '@/components/molecules/drawer';
import { formatTimeAgo } from '@/lib/utils/audience';
import type { AudienceMember } from '@/types';
import { formatActionLabel, resolveAudienceActionIcon } from './utils';

interface AudienceMemberActivityFeedProps {
  readonly member: AudienceMember;
}

export function AudienceMemberActivityFeed({
  member,
}: AudienceMemberActivityFeedProps) {
  const actions = member.latestActions;

  if (actions.length === 0) {
    return (
      <DrawerEmptyState
        className='min-h-[120px]'
        message='Activity will appear here as this contact interacts with your profile.'
      />
    );
  }

  // Sort newest first (actions may already be sorted but ensure it)
  const sorted = [...actions].sort((a, b) => {
    if (!a.timestamp && !b.timestamp) return 0;
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return (
    <div className='relative'>
      {/* Timeline line */}
      <div
        className='absolute top-3 bottom-3 left-[13px] w-px bg-(--linear-border-subtle)'
        aria-hidden='true'
      />

      <ul className='space-y-0.5'>
        {sorted.map((action, index) => (
          <li
            key={`${member.id}-activity-${action.label}-${action.timestamp ?? index}`}
            className='relative flex items-start gap-3 py-2'
          >
            {/* Icon circle */}
            <span
              className='relative z-10 inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-1 text-tertiary-token'
              aria-hidden='true'
            >
              <Icon
                name={resolveAudienceActionIcon(action.label)}
                className='h-3 w-3'
              />
            </span>

            {/* Content */}
            <div className='min-w-0 flex-1 pt-0.5'>
              <p className='text-[13px] leading-tight text-primary-token'>
                {formatActionLabel(action.label)}
              </p>
              {action.timestamp && (
                <p className='mt-0.5 text-[11px] text-tertiary-token'>
                  {formatTimeAgo(action.timestamp)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
