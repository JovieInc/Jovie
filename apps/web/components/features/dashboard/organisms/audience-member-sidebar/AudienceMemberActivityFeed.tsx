'use client';

import { Icon } from '@/components/atoms/Icon';
import { DrawerEmptyState } from '@/components/molecules/drawer';
import { renderAudienceEventSentence } from '@/lib/audience/activity-grammar';
import { formatTimeAgo } from '@/lib/utils/audience';
import type { AudienceMember } from '@/types';

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
        className='min-h-[104px]'
        message='Activity will appear here as this contact interacts with your profile.'
      />
    );
  }

  // Sort newest first (actions may already be sorted but ensure it)
  const sorted = [...actions]
    .sort((a, b) => {
      if (!a.timestamp && !b.timestamp) return 0;
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    })
    .slice(0, 10);

  return (
    <div className='relative'>
      <div
        className='absolute top-2.5 bottom-2.5 left-[11px] w-px bg-(--linear-border-subtle)'
        aria-hidden='true'
      />

      <ul className='space-y-px'>
        {sorted.map((action, index) => (
          <ActivityItem
            key={`${member.id}-activity-${action.label}-${action.timestamp ?? index}`}
            action={action}
          />
        ))}
      </ul>
    </div>
  );
}

function ActivityItem({
  action,
}: {
  readonly action: AudienceMember['latestActions'][number];
}) {
  const rendered = renderAudienceEventSentence(action);
  const label = rendered.kind === 'sentence' ? rendered.text : action.label;
  const icon = rendered.kind === 'sentence' ? rendered.icon : 'Sparkles';

  return (
    <li className='relative flex items-start gap-2.5 py-1.5'>
      <span
        className='relative z-10 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-1 text-tertiary-token'
        aria-hidden='true'
      >
        <Icon name={icon} className='h-[11px] w-[11px]' />
      </span>

      <div className='min-w-0 flex-1 pt-px'>
        <p className='truncate text-xs leading-4 text-primary-token'>{label}</p>
        <div className='mt-0.5 flex items-center gap-1.5 text-[10.5px] text-tertiary-token'>
          {action.sourceLabel ? (
            <span className='max-w-[140px] truncate rounded bg-surface-0 px-1 text-secondary-token'>
              {action.sourceLabel}
            </span>
          ) : null}
          {action.confidence === 'verified' ? (
            <span className='rounded bg-surface-0 px-1 text-secondary-token'>
              Verified
            </span>
          ) : null}
          {action.timestamp ? (
            <span>{formatTimeAgo(action.timestamp)}</span>
          ) : null}
        </div>
      </div>
    </li>
  );
}
